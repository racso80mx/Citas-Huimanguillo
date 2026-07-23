
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  writeBatch, 
  Timestamp, 
  setDoc,
  updateDoc,
  deleteDoc,
  increment,
  addDoc,
  DocumentReference,
  query,
  where,
  limit,
  orderBy,
  getCountFromServer,
  documentId,
  Firestore
} from 'firebase/firestore';
import { adminDb } from '@/firebase/server-config';
import type { 
  Patient, 
  Appointment, 
  LabAppointment,
  XRayAppointment,
  UltrasoundAppointment,
  VaccineAppointment,
  Clinic,
  Colonia,
  ServiceType,
  Specialty,
  Prescription,
  ArchiveCounts,
  MedicalConsultation,
  Cie10Record,
  PharmacyVoucher,
  Department,
  ModuleSettings,
  LabSettings,
  XRaySettings,
  UltrasoundSettings,
  VaccineSettings,
  AdminSettings,
  ArchiveSettings,
  PharmacySettings,
  WarehouseSettings,
  BISettings,
  Holiday,
  SpecialActionDay,
  Medication,
  Supply
} from './definitions';
import { PatientStatus, BookingMode } from './definitions';
import { v4 as uuidv4 } from 'uuid';
import { startOfDay, endOfDay, parseISO, startOfMonth, addDays } from 'date-fns';

// Re-export needed for internal server use and to comply with NextJS 15 rules
export { adminDb, doc, collection, deleteDoc, getDoc, getDocs, query, where, limit, orderBy, writeBatch, setDoc, updateDoc, addDoc };

/**
 * Serializes Firestore data to plain objects for safe transmission.
 * Handles Timestamps and References recursively.
 */
export function serializeData(data: any): any {
  if (data === null || data === undefined) return data;
  
  if (typeof data.toDate === 'function') {
    return data.toDate().toISOString();
  }
  
  if (data && typeof data === 'object' && 'seconds' in data && 'nanoseconds' in data) {
    try {
        return new Timestamp(data.seconds, data.nanoseconds).toDate().toISOString();
    } catch (e) {
        return new Date(data.seconds * 1000).toISOString();
    }
  }

  if (data instanceof DocumentReference) return data.id;
  if (Array.isArray(data)) return data.map(item => serializeData(item));
  
  if (typeof data === 'object' && data.constructor === Object) {
    const serialized: any = {};
    for (const key in data) {
      serialized[key] = serializeData(data[key]);
    }
    return serialized;
  }
  
  return data;
}

/**
 * Normaliza los datos de un paciente antes de guardarlos.
 * CRITICAL: Garantiza que el ID sea siempre la CURP para evitar duplicidad.
 */
function normalizePatientData(p: any) {
    const cleanCurp = String(p.curp || '').trim().toUpperCase();
    if (!cleanCurp) throw new Error("CURP es requerida para normalización.");

    const n = (p.name || '').trim().toUpperCase();
    const ap = (p.paternalLastName || '').trim().toUpperCase();
    const am = (p.maternalLastName || '').trim().toUpperCase();
    
    return {
        ...p,
        id: cleanCurp,
        curp: cleanCurp,
        name: n,
        paternalLastName: ap,
        maternalLastName: am,
        nombreCompleto: `${n} ${ap} ${am}`.replace(/\s+/g, ' ').trim()
    };
}

// --- CORE DATA ACCESS ---

export async function getModuleSettings(): Promise<ModuleSettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'moduleSettings'));
    return s.exists() ? serializeData(s.data()) : {
        citasMedicasEnabled: true,
        laboratorioEnabled: true,
        rayosXEnabled: true,
        ultrasoundEnabled: true,
        vacunasEnabled: true,
        archivoEnabled: true,
        farmaciaEnabled: true,
        almacenEnabled: true,
        archivoConsultaEnabled: true,
        citasMedicasWhatsAppEnabled: true,
        laboratorioWhatsAppEnabled: true,
        rayosXWhatsAppEnabled: true,
        ultrasoundWhatsAppEnabled: true,
        vacunasWhatsAppEnabled: true,
        archivoWhatsAppEnabled: true
    };
}

export async function updateModuleSettings(s: ModuleSettings) {
    await setDoc(doc(adminDb, 'settings', 'moduleSettings'), s);
    return { success: true };
}

export async function getPatientsData(options?: any): Promise<Patient[]> {
    const colRef = collection(adminDb, 'patients');
    let q;
    
    if (options?.searchCurp) {
        q = query(colRef, where('curp', '==', options.searchCurp.toUpperCase().trim()), limit(100));
    } else if (options?.searchExpediente) {
        q = query(colRef, where('expediente', '==', String(options.searchExpediente).trim()), limit(100));
    } else if (options?.searchName) {
        const term = options.searchName.toUpperCase().trim();
        q = query(colRef, where('nombreCompleto', '>=', term), where('nombreCompleto', '<=', term + '\uf8ff'), limit(500));
    } else if (options?.status && options.status !== 'Total') {
        q = query(colRef, where('status', '==', options.status), limit(10000));
    } else {
        q = query(colRef, limit(10000));
    }
    
    const snap = await getDocs(q);
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

async function hydrateAppointments(appointments: any[]) {
    if (!appointments || appointments.length === 0) return [];
    
    const patientIds = Array.from(new Set(appointments.map(a => a.patientId).filter(Boolean)));
    const patientsMap: Record<string, any> = {};
    
    if (patientIds.length > 0) {
        const CHUNK_SIZE = 30; 
        for (let i = 0; i < patientIds.length; i += CHUNK_SIZE) {
            const chunk = patientIds.slice(i, i + CHUNK_SIZE);
            const snap = await getDocs(query(collection(adminDb, 'patients'), where(documentId(), 'in', chunk)));
            snap.forEach(d => { patientsMap[d.id] = { ...d.data(), id: d.id }; });
        }
    }
    
    const clinicsSnap = await getDocs(collection(adminDb, 'clinics'));
    const clinicsMap: Record<string, string> = {};
    clinicsSnap.forEach(d => { clinicsMap[d.id] = d.data().name; });
    
    return appointments.map(app => serializeData({
        ...app,
        patient: patientsMap[app.patientId] || { name: 'PACIENTE DESCONOCIDO', curp: 'S/C', phoneNumber: 'S/T' },
        clinicName: clinicsMap[app.clinicId] || app.clinicName || 'CONSULTORIO NO ASIGNADO'
    }));
}

export async function getAppointmentsData() {
    const snap = await getDocs(query(collection(adminDb, 'appointments'), limit(10000)));
    return await hydrateAppointments(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getAppointmentsForClinic(id: string) {
    const snap = await getDocs(query(collection(adminDb, 'appointments'), where('clinicId', '==', id)));
    return await hydrateAppointments(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getLabAppointmentsData() {
    const snap = await getDocs(query(collection(adminDb, 'labAppointments'), limit(10000)));
    return await hydrateAppointments(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getXRayAppointmentsData() {
    const snap = await getDocs(query(collection(adminDb, 'xrayAppointments'), limit(10000)));
    return await hydrateAppointments(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getUltrasoundAppointmentsData() {
    const snap = await getDocs(query(collection(adminDb, 'ultrasoundAppointments'), limit(10000)));
    return await hydrateAppointments(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getVaccineAppointmentsData() {
    const snap = await getDocs(query(collection(adminDb, 'vaccineAppointments'), limit(10000)));
    return await hydrateAppointments(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getPatientCounts(): Promise<ArchiveCounts> {
    const coll = collection(adminDb, 'patients');
    const totalSnap = await getCountFromServer(coll);
    const total = totalSnap.data().count;
    
    const [bajaSnap, bajaDefSnap] = await Promise.all([
        getCountFromServer(query(coll, where('status', '==', PatientStatus.Baja))),
        getCountFromServer(query(coll, where('status', '==', PatientStatus.BajaDefinitiva)))
    ]);
    
    const bCount = bajaSnap.data().count;
    const bdCount = bajaDefSnap.data().count;
    
    return { 
        total, 
        vigente: total - (bCount + bdCount), 
        bajaTemporal: bCount, 
        bajaDefinitiva: bdCount 
    };
}

// --- MUTATIONS ---

export async function saveNewAppointment(appointment: any, patient: any, isDoubleSlot: boolean, coloniaName?: string) {
    const normalized = normalizePatientData(patient);
    const batch = writeBatch(adminDb);
    
    const patientRef = doc(adminDb, 'patients', normalized.id);
    batch.set(patientRef, normalized, { merge: true });
    
    const appData = { 
        ...appointment, 
        patientId: normalized.id, 
        id: uuidv4(), 
        coloniaName, 
        createdAt: new Date().toISOString() 
    };
    batch.set(doc(adminDb, 'appointments', appData.id), appData);
    
    await batch.commit();
    const clinicDoc = await getDoc(doc(adminDb, 'clinics', appointment.clinicId));
    return serializeData({ 
        success: true, 
        data: { 
            appointment: { ...appData, patient: normalized }, 
            clinic: clinicDoc.data() 
        } 
    });
}

export async function saveNewLabAppointment(appointment: any, patient: any) {
    const normalized = normalizePatientData(patient);
    const batch = writeBatch(adminDb);
    batch.set(doc(adminDb, 'patients', normalized.id), normalized, { merge: true });
    const appData = { ...appointment, patientId: normalized.id, id: uuidv4(), createdAt: new Date().toISOString() };
    batch.set(doc(adminDb, 'labAppointments', appData.id), appData);
    await batch.commit();
    return serializeData({ success: true, data: { ...appData, patient: normalized } });
}

export async function saveNewXRayAppointment(appointment: any, patient: any) {
    const normalized = normalizePatientData(patient);
    const batch = writeBatch(adminDb);
    batch.set(doc(adminDb, 'patients', normalized.id), normalized, { merge: true });
    const appData = { ...appointment, patientId: normalized.id, id: uuidv4(), createdAt: new Date().toISOString() };
    batch.set(doc(adminDb, 'xrayAppointments', appData.id), appData);
    await batch.commit();
    return serializeData({ success: true, data: { appointment: { ...appData, patient: normalized }, study: { name: appointment.studyName, indications: '' } } });
}

export async function saveNewUltrasoundAppointment(appointment: any, patient: any) {
    const normalized = normalizePatientData(patient);
    const batch = writeBatch(adminDb);
    batch.set(doc(adminDb, 'patients', normalized.id), normalized, { merge: true });
    const appData = { ...appointment, patientId: normalized.id, id: uuidv4(), createdAt: new Date().toISOString() };
    batch.set(doc(adminDb, 'ultrasoundAppointments', appData.id), appData);
    await batch.commit();
    return serializeData({ success: true, data: { appointment: { ...appData, patient: normalized }, study: { name: appointment.studyName, indications: '' } } });
}

export async function saveNewVaccineAppointment(appointment: any, patient: any) {
    const normalized = normalizePatientData(patient);
    const batch = writeBatch(adminDb);
    batch.set(doc(adminDb, 'patients', normalized.id), normalized, { merge: true });
    const appData = { ...appointment, patientId: normalized.id, id: uuidv4(), createdAt: new Date().toISOString() };
    batch.set(doc(adminDb, 'vaccineAppointments', appData.id), appData);
    await batch.commit();
    return serializeData({ success: true, data: { ...appData, patient: normalized } });
}

export async function updateAppointmentStatus(id: string, status: string, type: string) {
    const col = type === 'lab' ? 'labAppointments' : type === 'xray' ? 'xrayAppointments' : type === 'ultrasound' ? 'ultrasoundAppointments' : type === 'vaccine' ? 'vaccineAppointments' : 'appointments';
    await updateDoc(doc(adminDb, col, id), { status });
    return { success: true };
}

export async function rescheduleAppointment(id: string, date: string, type: string, time: string) {
    const col = type === 'lab' ? 'labAppointments' : type === 'xray' ? 'xrayAppointments' : type === 'ultrasound' ? 'ultrasoundAppointments' : type === 'vaccine' ? 'vaccineAppointments' : 'appointments';
    await updateDoc(doc(adminDb, col, id), { date, time });
    return { success: true, message: 'Reagendada.' };
}

export async function cloneAppointment(id: string, date: string, type: string, time: string) {
    const col = type === 'lab' ? 'labAppointments' : type === 'xray' ? 'xrayAppointments' : type === 'ultrasound' ? 'ultrasoundAppointments' : type === 'vaccine' ? 'vaccineAppointments' : 'appointments';
    const s = await getDoc(doc(adminDb, col, id));
    if (!s.exists()) return { success: false };
    const newId = uuidv4();
    await setDoc(doc(adminDb, col, newId), { ...s.data(), id: newId, date, time, status: 'Agendada', createdAt: new Date().toISOString() });
    return { success: true };
}

// --- CATALOGS ---

export async function getClinicsData() {
    const snap = await getDocs(collection(adminDb, 'clinics'));
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function updateClinics(clinics: Clinic[]) {
    const b = writeBatch(adminDb);
    clinics.forEach(c => b.set(doc(adminDb, 'clinics', c.id), c));
    await b.commit();
    return { success: true };
}

export async function bulkInsertDoctors(items: any[]) {
    const b = writeBatch(adminDb);
    items.forEach(item => {
        const id = uuidv4();
        b.set(doc(adminDb, 'clinics', id), {
            id,
            name: String(item.Unidad || '').toUpperCase(),
            doctorName: String(item.Médico || '').toUpperCase(),
            doctorCurp: String(item.CURP || '').toUpperCase(),
            professionalLicense: String(item.Cédula || '').toUpperCase(),
            serviceTypeId: String(item.Categoría || '').toUpperCase(),
            password: 'hospital_default',
            dailySlots: 10,
            startTime: '08:00',
            endTime: '13:00',
            bookingMode: 'time',
            consultationDuration: 30,
            weekendBookingEnabled: false
        });
    });
    await b.commit();
    return { success: true, processedCount: items.length };
}

export async function getColoniasData() {
    const snap = await getDocs(collection(adminDb, 'colonias'));
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function updateColonias(items: Colonia[]) {
    const b = writeBatch(adminDb);
    items.forEach(i => b.set(doc(adminDb, 'colonias', i.id), i));
    await b.commit();
    return { success: true };
}

export async function getServiceTypesData() {
    const snap = await getDocs(collection(adminDb, 'serviceTypes'));
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function updateServiceTypes(items: ServiceType[]) {
    const b = writeBatch(adminDb);
    items.forEach(i => b.set(doc(adminDb, 'serviceTypes', i.id), i));
    await b.commit();
    return { success: true };
}

export async function getSpecialtiesData() {
    const snap = await getDocs(collection(adminDb, 'specialties'));
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function updateSpecialties(items: Specialty[]) {
    const b = writeBatch(adminDb);
    items.forEach(i => b.set(doc(adminDb, 'specialties', i.id), i));
    await b.commit();
    return { success: true };
}

export async function getHolidaysData() {
    const snap = await getDocs(collection(adminDb, 'holidays'));
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function updateHolidays(items: Holiday[]) {
    const b = writeBatch(adminDb);
    const s = await getDocs(collection(adminDb, 'holidays'));
    s.forEach(d => b.delete(d.ref));
    items.forEach(i => b.set(doc(adminDb, 'holidays', i.date), i));
    await b.commit();
    return { success: true };
}

export async function getSpecialActionDaysData() {
    const snap = await getDocs(collection(adminDb, 'specialActionDays'));
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function updateSpecialActionDays(items: SpecialActionDay[]) {
    const b = writeBatch(adminDb);
    const s = await getDocs(collection(adminDb, 'specialActionDays'));
    s.forEach(d => b.delete(d.ref));
    items.forEach(i => b.set(doc(adminDb, 'specialActionDays', uuidv4()), i));
    await b.commit();
    return { success: true };
}

export async function getDepartmentsData() {
    const snap = await getDocs(collection(adminDb, 'departments'));
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function updateDepartments(items: Department[]) {
    const b = writeBatch(adminDb);
    items.forEach(i => b.set(doc(adminDb, 'departments', i.id), i));
    await b.commit();
    return { success: true };
}

// --- PATIENT MANAGEMENT ---

export async function savePatient(p: Omit<Patient, 'id'>, id?: string) {
    const normalized = normalizePatientData(p);
    const finalId = id || normalized.id;
    await setDoc(doc(adminDb, 'patients', finalId), { ...normalized, id: finalId }, { merge: true });
    return { success: true };
}

export async function updatePatient(id: string, p: Partial<Patient>) {
    const normalized = normalizePatientData({ ...p, id });
    await updateDoc(doc(adminDb, 'patients', id), normalized);
    return { success: true };
}

export async function updatePatientStatus(id: string, status: string) {
    await updateDoc(doc(adminDb, 'patients', id), { status });
    return { success: true };
}

export async function deletePatients(ids: string[]) {
    const b = writeBatch(adminDb);
    ids.forEach(id => b.delete(doc(adminDb, 'patients', id)));
    await b.commit();
    return { success: true };
}

export async function getPatientByCURP(c: string) {
    const snap = await getDoc(doc(adminDb, 'patients', c.toUpperCase().trim()));
    return snap.exists() ? serializeData({ success: true, data: { ...snap.data(), id: snap.id } }) : { success: false };
}

export async function bulkInsertPatients(records: any[]) {
    const b = writeBatch(adminDb);
    records.forEach(r => {
        try {
            const normalized = normalizePatientData({
                curp: r.CURP, name: r.Nombre, paternalLastName: r.Apaterno, maternalLastName: r.Amaterno,
                sex: r.Sexo === 'H' ? 'Hombre' : 'Mujer', age: parseInt(r.Edad) || 0,
                expediente: String(r['No.Expediente'] || ''),
                birthDate: r.FNacimiento, birthState: r.Estado, phoneNumber: String(r.Telefono || ''),
                coloniaName: r.Colonia, status: r.Estatus || PatientStatus.Vigente,
                registrationDate: r.FechaApertura, derechoAbiencia: r.DerechoAbiencia
            });
            b.set(doc(adminDb, 'patients', normalized.id), normalized, { merge: true });
        } catch (e) {}
    });
    await b.commit();
    return { success: true, processedCount: records.length };
}

export async function applyStatusUpdateChunk(expedientes: string[], status: any) {
    const q = query(collection(adminDb, 'patients'), where('expediente', 'in', expedientes));
    const snap = await getDocs(q);
    const batch = writeBatch(adminDb);
    snap.forEach(d => batch.update(d.ref, { status }));
    await batch.commit();
    return { success: true, count: snap.size };
}

export async function scanDuplicates(criteria: 'expediente' | 'curp' | 'name'): Promise<Patient[][]> {
    const snap = await getDocs(collection(adminDb, 'patients'));
    const all = snap.docs.map(d => ({ ...d.data(), id: d.id } as Patient));
    const groups: Record<string, Patient[]> = {};
    
    all.forEach(p => {
        let key = '';
        if (criteria === 'expediente') key = p.expediente || 'S/E';
        else if (criteria === 'curp') key = p.curp;
        else key = `${p.name} ${p.paternalLastName} ${p.maternalLastName}`.toUpperCase();
        
        if (key && key !== 'S/E') {
            if (!groups[key]) groups[key] = [];
            groups[key].push(p);
        }
    });
    
    return Object.values(groups).filter(g => g.length > 1);
}

// --- CONSULTATIONS & PRESCRIPTIONS ---

export async function getConsultationsByPatientId(pid: string) {
    const s = await getDocs(query(collection(adminDb, 'medicalConsultations'), where('patientId', '==', pid)));
    return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id })).sort((a: any, b: any) => String(b.date).localeCompare(String(a.date))));
}

export async function getConsultationByAppointmentId(aid: string) {
    const s = await getDocs(query(collection(adminDb, 'medicalConsultations'), where('appointmentId', '==', aid), limit(1)));
    return s.empty ? null : serializeData({ ...s.docs[0].data(), id: s.docs[0].id });
}

export async function saveMedicalConsultation(c: any) {
    const id = c.id || uuidv4();
    await setDoc(doc(adminDb, 'medicalConsultations', id), { ...c, id, createdAt: new Date().toISOString() });
    return { success: true, id };
}

export async function deleteMedicalConsultation(id: string) {
    await deleteDoc(doc(adminDb, 'medicalConsultations', id));
    return { success: true };
}

export async function createPrescription(p: any) {
    const folio = `REC-${uuidv4().split('-')[0].toUpperCase()}`;
    const id = uuidv4();
    const rx = { ...p, id, folio, status: 'pendiente', expiresAt: addDays(new Date(), 1).toISOString(), createdAt: new Date().toISOString() };
    await setDoc(doc(adminDb, 'prescriptions', id), rx);
    return serializeData({ success: true, folio, prescription: rx });
}

export async function updatePrescription(id: string, d: any) {
    await updateDoc(doc(adminDb, 'prescriptions', id), d);
    return { success: true };
}

export async function deletePrescription(id: string) {
    await deleteDoc(doc(adminDb, 'prescriptions', id));
    return { success: true };
}

export async function dispensePrescription(id: string, items: any[]) {
    const b = writeBatch(adminDb);
    items.forEach(i => b.update(doc(adminDb, 'medications', i.medicationId), { existencia: increment(-i.quantity) }));
    b.update(doc(adminDb, 'prescriptions', id), { status: 'surtida', dispensedAt: new Date().toISOString() });
    await b.commit();
    return { success: true };
}

export async function getPrescriptionsByPatientId(pid: string) {
    const s = await getDocs(query(collection(adminDb, 'prescriptions'), where('patientId', '==', pid)));
    return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id })).sort((a: any, b: any) => String(b.date).localeCompare(String(a.date))));
}

export async function getPendingPrescriptions(filters: any) {
    let q = query(collection(adminDb, 'prescriptions'), where('status', '==', 'pendiente'));
    if (filters.folio) q = query(q, where('folio', '==', filters.folio.toUpperCase()));
    if (filters.clinicId) q = query(q, where('clinicId', '==', filters.clinicId));
    const snap = await getDocs(q);
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getPrescriptionHistory(filters: any) {
    let q = query(collection(adminDb, 'prescriptions'), where('status', '==', 'surtida'), orderBy('dispensedAt', 'desc'));
    if (filters.startDate) q = query(q, where('dispensedAt', '>=', filters.startDate));
    if (filters.endDate) q = query(q, where('dispensedAt', '<=', filters.endDate));
    const snap = await getDocs(q);
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getPatientPrescriptionsCountTodayAction(pid: string) {
    const start = startOfDay(new Date()).toISOString();
    const end = endOfDay(new Date()).toISOString();
    const q = query(collection(adminDb, 'prescriptions'), where('patientId', '==', pid), where('date', '>=', start), where('date', '<=', end));
    const s = await getCountFromServer(q);
    return s.data().count;
}

// --- PHARMACY & SUPPLIES ---

export async function getMedications() {
    const snap = await getDocs(query(collection(adminDb, 'medications'), limit(10000)));
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function bulkInsertMedications(meds: any[], source: string) {
    const b = writeBatch(adminDb);
    meds.forEach(m => {
        const id = uuidv4();
        b.set(doc(adminDb, 'medications', id), {
            ...m, id,
            claveCuadroBasico: String(m.claveCuadroBasico || m.Clave || ''),
            descripcion: String(m.descripcion || m.Denominación || m.Nombre || '').toUpperCase(),
            existencia: parseInt(m.existencia || m.Stock || 0),
            lote: String(m.lote || m.Lote || 'N/A'),
            fechaCaducidad: String(m.fechaCaducidad || m.Caducidad || ''),
            fuenteEtiqueta: source,
            updatedAt: new Date().toISOString()
        });
    });
    await b.commit();
    return { success: true, processedCount: meds.length };
}

export async function deleteMedicationsBySource(source: string) {
    const snap = await getDocs(query(collection(adminDb, 'medications'), where('fuenteEtiqueta', '==', source)));
    const b = writeBatch(adminDb);
    snap.forEach(d => b.delete(d.ref));
    await b.commit();
    return { success: true, deletedCount: snap.size };
}

export async function deleteAllMedications() {
    const snap = await getDocs(collection(adminDb, 'medications'));
    const b = writeBatch(adminDb);
    snap.forEach(d => b.delete(d.ref));
    await b.commit();
    return { success: true };
}

export async function getSupplies() {
    const snap = await getDocs(query(collection(adminDb, 'supplies'), limit(10000)));
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function bulkInsertSupplies(items: any[]) {
    const b = writeBatch(adminDb);
    items.forEach(m => {
        const id = uuidv4();
        b.set(doc(adminDb, 'supplies', id), {
            ...m, id,
            claveCuadroBasico: String(m.claveCuadroBasico || m.Clave || ''),
            descripcion: String(m.descripcion || m.Denominación || '').toUpperCase(),
            existencia: parseInt(m.existencia || 0),
            lote: String(m.lote || 'N/A'),
            fechaCaducidad: String(m.fechaCaducidad || '')
        });
    });
    await b.commit();
    return { success: true, processedCount: items.length };
}

export async function deleteAllSupplies() {
    const snap = await getDocs(collection(adminDb, 'supplies'));
    const b = writeBatch(adminDb);
    snap.forEach(d => b.delete(d.ref));
    await b.commit();
    return { success: true };
}

export async function createPharmacyVoucher(v: any) {
    const folio = `VAL-${uuidv4().split('-')[0].toUpperCase()}`;
    const b = writeBatch(adminDb);
    v.items.forEach((i: any) => b.update(doc(adminDb, 'medications', i.medicationId), { existencia: increment(-i.quantity) }));
    b.set(doc(adminDb, 'pharmacyVouchers', uuidv4()), { ...v, folio, createdAt: new Date().toISOString() });
    await b.commit();
    return { success: true, folio };
}

export async function getPharmacyVouchers() {
    const snap = await getDocs(query(collection(adminDb, 'pharmacyVouchers'), orderBy('createdAt', 'desc'), limit(100)));
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

// --- CIE-10 ---

export async function searchCie10(term: string) {
    const snap = await getDocs(query(collection(adminDb, 'cie10Catalog'), where('nombre', '>=', term.toUpperCase()), where('nombre', '<=', term.toUpperCase() + '\uf8ff'), limit(50)));
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function bulkInsertCie10Catalog(items: any[]) {
    const b = writeBatch(adminDb);
    items.forEach(i => b.set(doc(adminDb, 'cie10Catalog', uuidv4()), { ...i, id: uuidv4() }));
    await b.commit();
    return { success: true, processedCount: items.length };
}

export async function deleteAllCie10Catalog() {
    const snap = await getDocs(collection(adminDb, 'cie10Catalog'));
    const b = writeBatch(adminDb);
    snap.forEach(d => b.delete(d.ref));
    await b.commit();
    return { success: true };
}

// --- ADMIN & MAINTENANCE ---

export async function getAdminSettingsData(): Promise<AdminSettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'adminSettings'));
    return s.exists() ? serializeData(s.data()) : { password: '' };
}

export async function updateAdminSettings(s: AdminSettings) { await setDoc(doc(adminDb, 'settings', 'adminSettings'), s); return { success: true }; }

export async function getArchiveSettings(): Promise<ArchiveSettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'archiveSettings'));
    return s.exists() ? serializeData(s.data()) : { password: '' };
}

export async function updateArchiveSettings(s: ArchiveSettings) { await setDoc(doc(adminDb, 'settings', 'archiveSettings'), s); return { success: true }; }

export async function getPharmacySettings(): Promise<PharmacySettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'pharmacySettings'));
    return s.exists() ? serializeData(s.data()) : { password: '' };
}

export async function updatePharmacySettings(s: PharmacySettings) { await setDoc(doc(adminDb, 'settings', 'pharmacySettings'), s); return { success: true }; }

export async function getWarehouseSettings(): Promise<WarehouseSettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'warehouseSettings'));
    return s.exists() ? serializeData(s.data()) : { password: '' };
}

export async function updateWarehouseSettings(s: WarehouseSettings) { await setDoc(doc(adminDb, 'settings', 'warehouseSettings'), s); return { success: true }; }

export async function getBISettings(): Promise<BISettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'biSettings'));
    return s.exists() ? serializeData(s.data()) : { password: '' };
}

export async function updateBISettings(s: BISettings) { await setDoc(doc(adminDb, 'settings', 'biSettings'), s); return { success: true }; }

export async function getAnnouncementsData(): Promise<string[]> {
    const s = await getDoc(doc(adminDb, 'settings', 'announcements'));
    return s.exists() ? s.data()?.messages || [] : [];
}

export async function updateAnnouncementsData(messages: string[]) {
    await setDoc(doc(adminDb, 'settings', 'announcements'), { messages });
    return { success: true };
}

export async function getBIData() {
    const [apps, lab, xr, us, vac, clinics, colonias] = await Promise.all([
        getDocs(collection(adminDb, 'appointments')),
        getDocs(collection(adminDb, 'labAppointments')),
        getDocs(collection(adminDb, 'xrayAppointments')),
        getDocs(collection(adminDb, 'ultrasoundAppointments')),
        getDocs(collection(adminDb, 'vaccineAppointments')),
        getDocs(collection(adminDb, 'clinics')),
        getDocs(collection(adminDb, 'colonias'))
    ]);
    return serializeData({
        appointments: apps.docs.map(d => ({ ...d.data(), id: d.id })),
        labAppointments: lab.docs.map(d => ({ ...d.data(), id: d.id })),
        xRayAppointments: xr.docs.map(d => ({ ...d.data(), id: d.id })),
        ultrasoundAppointments: us.docs.map(d => ({ ...d.data(), id: d.id })),
        vaccineAppointments: vac.docs.map(d => ({ ...d.data(), id: d.id })),
        clinics: clinics.docs.map(d => ({ ...d.data(), id: d.id })),
        colonias: colonias.docs.map(d => ({ ...d.data(), id: d.id }))
    });
}

export async function logActivity(action: string, details: string) {
    await addDoc(collection(adminDb, 'activityLog'), { timestamp: new Date().toISOString(), action, details });
    return { success: true };
}

export async function getLogsData(): Promise<any[]> {
    const snap = await getDocs(query(collection(adminDb, 'activityLog'), orderBy('timestamp', 'desc'), limit(500)));
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

// --- MODULE SPECIFIC SETTINGS ---

export async function getLabStudies() {
    const snap = await getDocs(collection(adminDb, 'labStudies'));
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getLabSettings(): Promise<LabSettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'labSettings'));
    return s.exists() ? serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 0, weekendBookingEnabled: false, startTime: '07:00', endTime: '13:00' };
}

export async function updateLabSettings(s: LabSettings) { await setDoc(doc(adminDb, 'settings', 'labSettings'), s); return { success: true }; }

export async function updateLabStudies(items: any[]) { 
    const b = writeBatch(adminDb);
    const s = await getDocs(collection(adminDb, 'labStudies'));
    s.forEach(d => b.delete(d.ref));
    items.forEach(i => b.set(doc(adminDb, 'labStudies', i.id), i));
    await b.commit();
    return { success: true }; 
}

export async function getXRayStudies() {
    const snap = await getDocs(collection(adminDb, 'xRayStudies'));
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getXRaySettings(): Promise<XRaySettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'xraySettings'));
    return s.exists() ? serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 0, weekendBookingEnabled: false, startTime: '08:00', endTime: '14:00' };
}

export async function updateXRaySettings(s: XRaySettings) { await setDoc(doc(adminDb, 'settings', 'xraySettings'), s); return { success: true }; }

export async function updateXRayStudies(items: any[]) {
    const b = writeBatch(adminDb);
    const s = await getDocs(collection(adminDb, 'xRayStudies'));
    s.forEach(d => b.delete(d.ref));
    items.forEach(i => b.set(doc(adminDb, 'xRayStudies', i.id), i));
    await b.commit();
    return { success: true };
}

export async function getUltrasoundStudies() {
    const snap = await getDocs(collection(adminDb, 'ultrasoundStudies'));
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getUltrasoundSettings(): Promise<UltrasoundSettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'ultrasoundSettings'));
    return s.exists() ? serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 0, weekendBookingEnabled: false, startTime: '08:00', endTime: '14:00' };
}

export async function updateUltrasoundSettings(s: UltrasoundSettings) { await setDoc(doc(adminDb, 'settings', 'ultrasoundSettings'), s); return { success: true }; }

export async function updateUltrasoundStudies(items: any[]) {
    const b = writeBatch(adminDb);
    const s = await getDocs(collection(adminDb, 'ultrasoundStudies'));
    s.forEach(d => b.delete(d.ref));
    items.forEach(i => b.set(doc(adminDb, 'ultrasoundStudies', i.id), i));
    await b.commit();
    return { success: true };
}

export async function getVaccines() {
    const snap = await getDocs(collection(adminDb, 'vaccines'));
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getVaccineSettings(): Promise<VaccineSettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'vaccineSettings'));
    return s.exists() ? serializeData(s.data()) : { dailySlots: 15, waitlistSlots: 5, weekendBookingEnabled: false, startTime: '08:00', endTime: '13:00' };
}

export async function updateVaccineSettings(s: VaccineSettings) { await setDoc(doc(adminDb, 'settings', 'vaccineSettings'), s); return { success: true }; }

export async function updateVaccines(items: any[]) {
    const b = writeBatch(adminDb);
    const s = await getDocs(collection(adminDb, 'vaccines'));
    s.forEach(d => b.delete(d.ref));
    items.forEach(i => b.set(doc(adminDb, 'vaccines', i.id), i));
    await b.commit();
    return { success: true };
}

export async function getAvailableSlotsForDate(clinicId: string, dateStr: string) {
    return { timeSlots: ["08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00"], tokens: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] };
}

export async function getAppointmentCountOnDate(id: string, d: string) {
    const q = query(collection(adminDb, 'appointments'), where('clinicId', '==', id), where('date', '>=', startOfDay(parseISO(d)).toISOString()), where('date', '<=', endOfDay(parseISO(d)).toISOString()));
    const s = await getCountFromServer(q);
    return s.data().count;
}

export async function getAttendedPatientsForClinic(id: string) {
    const q = query(collection(adminDb, 'appointments'), where('clinicId', '==', id), where('status', '==', 'Atendido'));
    const snap = await getDocs(q);
    const pIds = Array.from(new Set(snap.docs.map(d => d.data().patientId)));
    if (pIds.length === 0) return [];
    const pSnap = await getDocs(query(collection(adminDb, 'patients'), where(documentId(), 'in', pIds)));
    return serializeData(pSnap.docs.map(d => ({ ...d.data(), id: d.id })));
}

// --- MAINTENANCE ---

export async function normalizeExpedientesAction() {
    const snap = await getDocs(collection(adminDb, 'patients'));
    const b = writeBatch(adminDb);
    let count = 0;
    snap.forEach(d => {
        const exp = String(d.data().expediente || '');
        if (exp && exp.length < 5) {
            b.update(d.ref, { expediente: exp.padStart(5, '0') });
            count++;
        }
    });
    await b.commit();
    return { success: true, count };
}

export async function rebuildNombreCompletoAction() {
    const snap = await getDocs(collection(adminDb, 'patients'));
    const b = writeBatch(adminDb);
    let count = 0;
    snap.forEach(d => {
        const data = d.data();
        const nc = `${data.name} ${data.paternalLastName} ${data.maternalLastName}`.replace(/\s+/g, ' ').trim().toUpperCase();
        b.update(d.ref, { nombreCompleto: nc });
        count++;
    });
    await b.commit();
    return { success: true, count };
}

export async function cleanupOldRecords() {
    const dateLimit = startOfMonth(new Date());
    const cols = ['appointments', 'labAppointments', 'xrayAppointments', 'ultrasoundAppointments', 'vaccineAppointments'];
    let deletedCount = 0;
    for (const c of cols) {
        const snap = await getDocs(query(collection(adminDb, c), where('date', '<', dateLimit.toISOString())));
        const b = writeBatch(adminDb);
        snap.forEach(d => { b.delete(d.ref); deletedCount++; });
        await b.commit();
    }
    return { success: true, deletedCount };
}

export async function downloadBackupAction() {
    const cols = ['appointments', 'labAppointments', 'xrayAppointments', 'ultrasoundAppointments', 'vaccineAppointments', 'patients', 'clinics'];
    const results: any = {};
    for (const c of cols) {
        const snap = await getDocs(collection(adminDb, c));
        results[c] = snap.docs.map(d => serializeData({ ...d.data(), id: d.id }));
    }
    return { success: true, data: results };
}
