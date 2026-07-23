
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
  Firestore,
  startAt,
  endAt
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
  Holiday,
  SpecialActionDay,
  Medication,
  Supply,
  PrescriptionItem,
  AppointmentStatus
} from './definitions';
import { PatientStatus, BookingMode } from './definitions';
import { v4 as uuidv4 } from 'uuid';
import { startOfDay, endOfDay, parseISO, startOfMonth, endOfMonth, addDays, subMonths } from 'date-fns';

/**
 * Serializa datos de Firestore a objetos planos para transmisión segura.
 */
export function serializeData(data: any): any {
  if (data === null || data === undefined) return data;
  
  if (typeof data.toDate === 'function') {
    return data.toDate().toISOString();
  }
  
  if (data && typeof data === 'object' && 'seconds' in data && 'nanoseconds' in data) {
    try {
        return new Date(data.seconds * 1000).toISOString();
    } catch (e) {
        return data;
    }
  }

  if (data instanceof DocumentReference) return data.id;
  
  if (Array.isArray(data)) {
    return data.map(item => serializeData(item));
  }
  
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
 * Normaliza los datos de un paciente. El ID del documento es SIEMPRE la CURP.
 */
function normalizePatientData(p: any) {
    const cleanCurp = String(p.curp || '').trim().toUpperCase();
    if (!cleanCurp) throw new Error("La CURP es obligatoria.");

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
        nombreCompleto: `${n} ${ap} ${am}`.replace(/\s+/g, ' ').trim(),
        status: p.status || PatientStatus.Vigente
    };
}

// --- CONFIGURACIÓN Y SEGURIDAD ---

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
        archivoWhatsAppEnabled: true,
        citasMedicasPassword: '123',
        archivoConsultaPassword: '123'
    };
}

export async function updateModuleSettings(s: ModuleSettings) {
    await setDoc(doc(adminDb, 'settings', 'moduleSettings'), s);
    return { success: true };
}

export async function getAdminSettingsData(): Promise<AdminSettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'adminSettings'));
    return s.exists() ? serializeData(s.data()) : { password: '' };
}

export async function updateAdminSettings(s: AdminSettings) {
    await setDoc(doc(adminDb, 'settings', 'adminSettings'), s);
    return { success: true };
}

export async function getArchiveSettings(): Promise<ArchiveSettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'archiveSettings'));
    return s.exists() ? serializeData(s.data()) : { password: '123' };
}

export async function updateArchiveSettings(s: ArchiveSettings) {
    await setDoc(doc(adminDb, 'settings', 'archiveSettings'), s);
    return { success: true };
}

export async function getPharmacySettings(): Promise<PharmacySettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'pharmacySettings'));
    return s.exists() ? serializeData(s.data()) : { password: '123' };
}

export async function updatePharmacySettings(s: PharmacySettings) {
    await setDoc(doc(adminDb, 'settings', 'pharmacySettings'), s);
    return { success: true };
}

export async function getWarehouseSettings(): Promise<WarehouseSettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'warehouseSettings'));
    return s.exists() ? serializeData(s.data()) : { password: '123' };
}

export async function updateWarehouseSettings(s: WarehouseSettings) {
    await setDoc(doc(adminDb, 'settings', 'warehouseSettings'), s);
    return { success: true };
}

// --- PACIENTES ---

export async function getPatientsData(options?: any): Promise<Patient[]> {
    const colRef = collection(adminDb, 'patients');
    let q;
    
    const pageLimit = options?.limitNum || 100;

    if (options?.searchCurp) {
        q = query(colRef, where('curp', '==', options.searchCurp.toUpperCase().trim()), limit(1));
    } else if (options?.searchExpediente) {
        q = query(colRef, where('expediente', '==', String(options.searchExpediente).trim()), limit(1));
    } else if (options?.searchName) {
        const term = options.searchName.toUpperCase().trim();
        q = query(colRef, where('nombreCompleto', '>=', term), where('nombreCompleto', '<=', term + '\uf8ff'), limit(pageLimit));
    } else if (options?.status && options.status !== 'Total') {
        q = query(colRef, where('status', '==', options.status), limit(pageLimit));
    } else {
        q = query(colRef, limit(pageLimit));
    }
    
    const snap = await getDocs(q);
    let results = snap.docs.map(d => ({ ...d.data(), id: d.id } as Patient));
    
    if (options?.status && options.status !== 'Total') {
        const target = options.status as PatientStatus;
        results = results.filter(p => {
            const pStatus = p.status || PatientStatus.Vigente;
            return pStatus === target;
        });
    }
    
    return serializeData(results);
}

export async function getPatientCounts(): Promise<ArchiveCounts> {
    const coll = collection(adminDb, 'patients');
    const totalSnap = await getCountFromServer(coll);
    const total = totalSnap.data().count;
    
    const [bajaSnap, bajaDefSnap] = await Promise.all([
        getCountFromServer(query(coll, where('status', '==', PatientStatus.Baja))),
        getCountFromServer(query(coll, where('status', '==', PatientStatus.BajaDefinitiva)))
    ]);
    
    const countBaja = bajaSnap.data().count;
    const countBajaDef = bajaDefSnap.data().count;
    
    return { 
        total, 
        vigente: Math.max(0, total - (countBaja + countBajaDef)), 
        bajaTemporal: countBaja, 
        bajaDefinitiva: countBajaDef 
    };
}

export async function savePatient(p: Omit<Patient, 'id'>, id?: string) {
    const normalized = normalizePatientData(p);
    await setDoc(doc(adminDb, 'patients', normalized.id), normalized, { merge: true });
    return { success: true };
}

export async function updatePatient(id: string, p: Partial<Patient>) {
    const normalized = normalizePatientData({ ...p, curp: p.curp || id });
    await setDoc(doc(adminDb, 'patients', id), normalized, { merge: true });
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
    const snap = await getDocs(query(collection(adminDb, 'patients'), limit(5000)));
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

// --- CITAS (AGENDA) ---

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
        patient: patientsMap[app.patientId] || { name: 'PACIENTE NO REGISTRADO', curp: 'S/C', phoneNumber: 'S/T' },
        clinicName: clinicsMap[app.clinicId] || app.clinicName || 'N/A'
    }));
}

/**
 * OPTIMIZACIÓN: Rango dinámico para evitar cargar historial masivo.
 */
export async function getAppointmentsData(options?: { startDate?: string, endDate?: string }) {
    const start = options?.startDate ? Timestamp.fromDate(parseISO(options.startDate)) : Timestamp.fromDate(subMonths(new Date(), 3));
    const end = options?.endDate ? Timestamp.fromDate(parseISO(options.endDate)) : Timestamp.fromDate(addDays(new Date(), 30));
    
    const q = query(
        collection(adminDb, 'appointments'), 
        where('date', '>=', start),
        where('date', '<=', end),
        limit(2000)
    );
    const snap = await getDocs(q);
    return await hydrateAppointments(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getAppointmentsForClinic(id: string) {
    const start = Timestamp.fromDate(subMonths(new Date(), 1));
    const q = query(
        collection(adminDb, 'appointments'), 
        where('clinicId', '==', id),
        where('date', '>=', start),
        limit(1000)
    );
    const snap = await getDocs(q);
    return await hydrateAppointments(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function deleteAppointment(id: string) {
    await deleteDoc(doc(adminDb, 'appointments', id));
    return { success: true };
}

export async function saveNewAppointment(appointment: any, patient: any, isDoubleSlot: boolean, coloniaName?: string) {
    const normalized = normalizePatientData(patient);
    const dateObj = typeof appointment.date === 'string' ? parseISO(appointment.date) : appointment.date;
    const start = Timestamp.fromDate(startOfDay(dateObj));
    const end = Timestamp.fromDate(endOfDay(dateObj));
    
    const qDuplicate = query(
        collection(adminDb, 'appointments'),
        where('patientId', '==', normalized.id),
        where('clinicId', '==', appointment.clinicId),
        where('date', '>=', start),
        where('date', '<=', end)
    );
    
    const duplicateSnap = await getDocs(qDuplicate);
    if (!duplicateSnap.empty) {
        return { success: false, error: 'Este paciente ya cuenta con una cita agendada hoy en este núcleo.' };
    }

    const batch = writeBatch(adminDb);
    batch.set(doc(adminDb, 'patients', normalized.id), normalized, { merge: true });
    
    const appointmentNumber = `APP-${uuidv4().split('-')[0].toUpperCase()}`;
    const appData = { 
        ...appointment, 
        appointmentNumber,
        patientId: normalized.id, 
        id: uuidv4(), 
        coloniaName,
        date: Timestamp.fromDate(dateObj), 
        createdAt: Timestamp.now() 
    };
    batch.set(doc(adminDb, 'appointments', appData.id), appData);
    
    await batch.commit();
    const clinicDoc = await getDoc(doc(adminDb, 'clinics', appointment.clinicId));
    return serializeData({ success: true, data: { appointment: { ...appData, patient: normalized }, clinic: clinicDoc.data() } });
}

export async function updateAppointmentStatus(id: string, status: AppointmentStatus, type: string) {
    const colName = type === 'medical' ? 'appointments' : 
                   type === 'lab' ? 'labAppointments' :
                   type === 'xray' ? 'xrayAppointments' :
                   type === 'ultrasound' ? 'ultrasoundAppointments' :
                   'vaccineAppointments';
    
    await updateDoc(doc(adminDb, colName, id), { status });
    return { success: true };
}

export async function getLabAppointmentsData() {
    const start = Timestamp.fromDate(subMonths(new Date(), 3));
    const q = query(collection(adminDb, 'labAppointments'), where('date', '>=', start), limit(1000));
    const snap = await getDocs(q);
    return await hydrateAppointments(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function deleteLabAppointment(id: string) {
    await deleteDoc(doc(adminDb, 'labAppointments', id));
    return { success: true };
}

export async function saveNewLabAppointment(appointment: any, patient: any) {
    const normalized = normalizePatientData(patient);
    const batch = writeBatch(adminDb);
    batch.set(doc(adminDb, 'patients', normalized.id), normalized, { merge: true });
    const appData = { ...appointment, patientId: normalized.id, id: uuidv4(), date: Timestamp.fromDate(parseISO(appointment.date)), createdAt: Timestamp.now() };
    batch.set(doc(adminDb, 'labAppointments', appData.id), appData);
    await batch.commit();
    return serializeData({ success: true, data: { ...appData, patient: normalized } });
}

export async function getXRayAppointmentsData() {
    const start = Timestamp.fromDate(subMonths(new Date(), 3));
    const q = query(collection(adminDb, 'xrayAppointments'), where('date', '>=', start), limit(1000));
    const snap = await getDocs(q);
    return await hydrateAppointments(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function deleteXRayAppointment(id: string) {
    await deleteDoc(doc(adminDb, 'xrayAppointments', id));
    return { success: true };
}

export async function saveNewXRayAppointment(appointment: any, patient: any) {
    const normalized = normalizePatientData(patient);
    const batch = writeBatch(adminDb);
    batch.set(doc(adminDb, 'patients', normalized.id), normalized, { merge: true });
    const appData = { ...appointment, patientId: normalized.id, id: uuidv4(), date: Timestamp.fromDate(parseISO(appointment.date)), createdAt: Timestamp.now() };
    batch.set(doc(adminDb, 'xrayAppointments', appData.id), appData);
    await batch.commit();
    return serializeData({ success: true, data: { appointment: { ...appData, patient: normalized }, study: { name: appointment.studyName, indications: '' } } });
}

export async function getUltrasoundAppointmentsData() {
    const start = Timestamp.fromDate(subMonths(new Date(), 3));
    const q = query(collection(adminDb, 'ultrasoundAppointments'), where('date', '>=', start), limit(1000));
    const snap = await getDocs(q);
    return await hydrateAppointments(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function deleteUltrasoundAppointment(id: string) {
    await deleteDoc(doc(adminDb, 'ultrasoundAppointments', id));
    return { success: true };
}

export async function saveNewUltrasoundAppointment(appointment: any, patient: any) {
    const normalized = normalizePatientData(patient);
    const batch = writeBatch(adminDb);
    batch.set(doc(adminDb, 'patients', normalized.id), normalized, { merge: true });
    const appData = { ...appointment, patientId: normalized.id, id: uuidv4(), date: Timestamp.fromDate(parseISO(appointment.date)), createdAt: Timestamp.now() };
    batch.set(doc(adminDb, 'ultrasoundAppointments', appData.id), appData);
    await batch.commit();
    return serializeData({ success: true, data: { appointment: { ...appData, patient: normalized }, study: { name: appointment.studyName, indications: '' } } });
}

export async function getVaccineAppointmentsData() {
    const start = Timestamp.fromDate(subMonths(new Date(), 3));
    const q = query(collection(adminDb, 'vaccineAppointments'), where('date', '>=', start), limit(1000));
    const snap = await getDocs(q);
    return await hydrateAppointments(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function deleteVaccineAppointment(id: string) {
    await deleteDoc(doc(adminDb, 'vaccineAppointments', id));
    return { success: true };
}

export async function saveNewVaccineAppointment(appointment: any, patient: any) {
    const normalized = normalizePatientData(patient);
    const batch = writeBatch(adminDb);
    batch.set(doc(adminDb, 'patients', normalized.id), normalized, { merge: true });
    const appData = { ...appointment, patientId: normalized.id, id: uuidv4(), date: Timestamp.fromDate(parseISO(appointment.date)), createdAt: Timestamp.now() };
    batch.set(doc(adminDb, 'vaccineAppointments', appData.id), appData);
    await batch.commit();
    return serializeData({ success: true, data: { ...appData, patient: normalized } });
}

// --- CATALOGOS ---

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

export async function deleteClinic(id: string) {
    await deleteDoc(doc(adminDb, 'clinics', id));
    return { success: true };
}

export async function bulkInsertDoctors(items: any[]) {
    const b = writeBatch(adminDb);
    items.forEach(item => {
        const id = uuidv4();
        b.set(doc(adminDb, 'clinics', id), {
            id, name: String(item.Unidad || '').toUpperCase(), doctorName: String(item.Médico || '').toUpperCase(),
            doctorCurp: String(item.CURP || '').toUpperCase(), professionalLicense: String(item.Cédula || '').toUpperCase(),
            serviceTypeId: String(item.Categoría || '').toUpperCase(), password: 'hospital_default',
            dailySlots: 10, startTime: '08:00', endTime: '13:00', bookingMode: 'time', consultationDuration: 30, weekendBookingEnabled: false
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

// --- CONSULTAS Y RECETAS ---

export async function getConsultationsByPatientId(pid: string) {
    const s = await getDocs(query(collection(adminDb, 'medicalConsultations'), where('patientId', '==', pid), orderBy('date', 'desc'), limit(100)));
    return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getConsultationByAppointmentId(aid: string) {
    const s = await getDocs(query(collection(adminDb, 'medicalConsultations'), where('appointmentId', '==', aid), limit(1)));
    return s.empty ? null : serializeData({ ...s.docs[0].data(), id: s.docs[0].id });
}

export async function saveMedicalConsultation(c: any) {
    const id = c.id || uuidv4();
    await setDoc(doc(adminDb, 'medicalConsultations', id), { ...c, id, createdAt: Timestamp.now() });
    return { success: true, id };
}

export async function deleteMedicalConsultation(id: string) {
    await deleteDoc(doc(adminDb, 'medicalConsultations', id));
    return { success: true };
}

export async function getAttendedPatientsForClinic(id: string) {
    const start = Timestamp.fromDate(subMonths(new Date(), 1));
    const q = query(
        collection(adminDb, 'appointments'), 
        where('clinicId', '==', id), 
        where('status', '==', 'Atendido'),
        where('date', '>=', start),
        limit(500)
    );
    const snap = await getDocs(q);
    const pIds = Array.from(new Set(snap.docs.map(d => d.data().patientId)));
    if (pIds.length === 0) return [];
    
    const CHUNK_SIZE = 30;
    let results: any[] = [];
    for (let i = 0; i < pIds.length; i += CHUNK_SIZE) {
        const chunk = pIds.slice(i, i + CHUNK_SIZE);
        const pSnap = await getDocs(query(collection(adminDb, 'patients'), where(documentId(), 'in', chunk)));
        results = [...results, ...pSnap.docs.map(d => ({ ...d.data(), id: d.id }))];
    }
    return serializeData(results);
}

export async function createPrescription(p: any) {
    const folio = `REC-${uuidv4().split('-')[0].toUpperCase()}`;
    const id = uuidv4();
    const rx = { ...p, id, folio, status: 'pendiente', date: Timestamp.fromDate(parseISO(p.date)), expiresAt: Timestamp.fromDate(addDays(new Date(), 1)), createdAt: Timestamp.now() };
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
    b.update(doc(adminDb, 'prescriptions', id), { status: 'surtida', dispensedAt: Timestamp.now() });
    await b.commit();
    return { success: true };
}

export async function getPrescriptionsByPatientId(pid: string) {
    const s = await getDocs(query(collection(adminDb, 'prescriptions'), where('patientId', '==', pid), limit(50)));
    return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id })).sort((a: any, b: any) => String(b.date).localeCompare(String(a.date))));
}

export async function getPendingPrescriptions(filters: any) {
    let q = query(collection(adminDb, 'prescriptions'), where('status', '==', 'pendiente'), limit(200));
    if (filters.folio) q = query(q, where('folio', '==', filters.folio.toUpperCase()));
    if (filters.clinicId) q = query(q, where('clinicId', '==', filters.clinicId));
    const snap = await getDocs(q);
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getPrescriptionHistory(filters: any) {
    let q = query(collection(adminDb, 'prescriptions'), where('status', '==', 'surtida'), orderBy('dispensedAt', 'desc'), limit(500));
    if (filters.startDate) q = query(q, where('dispensedAt', '>=', Timestamp.fromDate(parseISO(filters.startDate))));
    if (filters.endDate) q = query(q, where('dispensedAt', '<=', Timestamp.fromDate(parseISO(filters.endDate))));
    const snap = await getDocs(q);
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getPatientPrescriptionsCountTodayAction(pid: string) {
    const start = Timestamp.fromDate(startOfDay(new Date()));
    const end = Timestamp.fromDate(endOfDay(new Date()));
    const q = query(collection(adminDb, 'prescriptions'), where('patientId', '==', pid), where('createdAt', '>=', start), where('createdAt', '<=', end));
    const s = await getCountFromServer(q);
    return s.data().count;
}

// --- FARMACIA ---

export async function getMedications(options?: any) {
    const colRef = collection(adminDb, 'medications');
    let q = query(colRef, limit(options?.limitNum || 100));
    
    if (options?.search) {
        const term = options.search.toUpperCase();
        q = query(colRef, where('descripcion', '>=', term), where('descripcion', '<=', term + '\uf8ff'), limit(200));
    }
    
    const snap = await getDocs(q);
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function bulkInsertMedications(meds: any[], source: string) {
    const b = writeBatch(adminDb);
    meds.forEach(m => {
        const id = uuidv4();
        b.set(doc(adminDb, 'medications', id), {
            ...m, id, claveCuadroBasico: String(m.claveCuadroBasico || m.Clave || ''),
            descripcion: String(m.descripcion || m.Denominación || m.Nombre || '').toUpperCase(),
            existencia: parseInt(m.existencia || m.Stock || 0), lote: String(m.lote || m.Lote || 'N/A'),
            fechaCaducidad: String(m.fechaCaducidad || m.Caducidad || ''), fuenteEtiqueta: source, updatedAt: Timestamp.now()
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
    const snap = await getDocs(query(collection(adminDb, 'supplies'), limit(500)));
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function bulkInsertSupplies(items: any[]) {
    const b = writeBatch(adminDb);
    items.forEach(m => {
        const id = uuidv4();
        b.set(doc(adminDb, 'supplies', id), {
            ...m, id, claveCuadroBasico: String(m.claveCuadroBasico || m.Clave || ''),
            descripcion: String(m.descripcion || m.Denominación || '').toUpperCase(),
            existencia: parseInt(m.existencia || 0), lote: String(m.lote || 'N/A'), fechaCaducidad: String(m.fechaCaducidad || '')
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
    b.set(doc(adminDb, 'pharmacyVouchers', uuidv4()), { ...v, folio, createdAt: Timestamp.now() });
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

// --- LOGS ---

export async function logActivity(action: string, details: string) {
    await addDoc(collection(adminDb, 'activityLog'), { timestamp: Timestamp.now(), action, details });
    return { success: true };
}

export async function getLogsData(): Promise<any[]> {
    const snap = await getDocs(query(collection(adminDb, 'activityLog'), orderBy('timestamp', 'desc'), limit(500)));
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

// --- ANUNCIOS ---

export async function getAnnouncementsData(): Promise<string[]> {
    const s = await getDoc(doc(adminDb, 'settings', 'announcements'));
    return s.exists() ? s.data()?.messages || [] : [];
}

export async function updateAnnouncementsData(messages: string[]) {
    await setDoc(doc(adminDb, 'settings', 'announcements'), { messages });
    return { success: true };
}

// --- REPROGRAMAR Y CLONAR ---

export async function rescheduleAppointment(id: string, date: string, type: string, time: string) {
    const colName = type === 'medical' ? 'appointments' : 
                   type === 'lab' ? 'labAppointments' :
                   type === 'xray' ? 'xrayAppointments' :
                   type === 'ultrasound' ? 'ultrasoundAppointments' :
                   'vaccineAppointments';
    
    await updateDoc(doc(adminDb, colName, id), {
        date: Timestamp.fromDate(parseISO(date)),
        time: time,
        updatedAt: Timestamp.now()
    });
    return { success: true, message: 'Cita reprogramada correctamente.' };
}

export async function cloneAppointment(id: string, date: string, type: string, time: string) {
    const colName = type === 'medical' ? 'appointments' : 
                   type === 'lab' ? 'labAppointments' :
                   type === 'xray' ? 'xrayAppointments' :
                   type === 'ultrasound' ? 'ultrasoundAppointments' :
                   'vaccineAppointments';
    
    const snap = await getDoc(doc(adminDb, colName, id));
    if (!snap.exists()) return { success: false, message: 'No se encontró la cita original.' };
    
    const data = snap.data();
    const newId = uuidv4();
    const prefix = type === 'medical' ? 'APP' : type.toUpperCase().substring(0,3);
    const newFolio = `${prefix}-${uuidv4().split('-')[0].toUpperCase()}`;
    
    await setDoc(doc(adminDb, colName, newId), {
        ...data,
        id: newId,
        appointmentNumber: newFolio,
        date: Timestamp.fromDate(parseISO(date)),
        time: time,
        status: 'Agendada',
        createdAt: Timestamp.now()
    });
    
    return { success: true, message: 'Nueva cita asignada correctamente.' };
}

export async function getAvailableSlotsForDate(clinicId: string, date: string) {
    const dateStr = date.split('T')[0];
    const clinicDoc = await getDoc(doc(adminDb, 'clinics', clinicId));
    if (!clinicDoc.exists()) return {};
    const clinic = clinicDoc.data() as Clinic;
    
    const q = query(collection(adminDb, 'appointments'), where('clinicId', '==', clinicId), where('date', '>=', Timestamp.fromDate(startOfDay(parseISO(dateStr)))), where('date', '<=', Timestamp.fromDate(endOfDay(parseISO(dateStr)))));
    const snap = await getDocs(q);
    const booked = snap.docs.map(d => d.data().time);
    
    if (clinic.bookingMode === BookingMode.Token) {
        const total = (clinic.dailySlots || 15) + (clinic.waitlistSlots || 0);
        const free = Array.from({ length: total }, (_, i) => i + 1).filter(n => !booked.includes(`Ficha ${n}`));
        return { tokens: free };
    } else {
        const generateTimeSlots = (start: string, end: string, dur: number) => {
            const slots = [];
            let curr = new Date(`1970-01-01T${start}:00`);
            const endD = new Date(`1970-01-01T${end}:00`);
            while (curr < endD) {
                slots.push(curr.toTimeString().substring(0, 5));
                curr = new Date(curr.getTime() + dur * 60000);
            }
            return slots;
        };
        const all = generateTimeSlots(clinic.startTime, clinic.endTime, clinic.consultationDuration || 30);
        const free = all.filter(s => s !== clinic.breakTime && !booked.includes(s));
        return { timeSlots: free };
    }
}

export async function getAppointmentCountOnDate(clinicId: string, date: string) {
    const q = query(collection(adminDb, 'appointments'), where('clinicId', '==', clinicId), where('date', '>=', Timestamp.fromDate(startOfDay(parseISO(date)))), where('date', '<=', Timestamp.fromDate(endOfDay(parseISO(date)))));
    const s = await getCountFromServer(q);
    return s.data().count;
}

// --- MANTENIMIENTO ---

export async function normalizeExpedientesAction() {
    const snap = await getDocs(query(collection(adminDb, 'patients'), limit(5000)));
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
    const snap = await getDocs(query(collection(adminDb, 'patients'), limit(5000)));
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
        const snap = await getDocs(query(collection(adminDb, c), where('date', '<', Timestamp.fromDate(dateLimit)), limit(5000)));
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
        const snap = await getDocs(query(collection(adminDb, c), limit(10000)));
        results[c] = snap.docs.map(d => serializeData({ ...d.data(), id: d.id }));
    }
    return { success: true, data: results };
}

// --- MÓDULOS ESPECÍFICOS ---

export async function getLabSettings() {
    const s = await getDoc(doc(adminDb, 'settings', 'labSettings'));
    return s.exists() ? serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 0, weekendBookingEnabled: false, password: '123' };
}

export async function updateLabSettings(s: LabSettings) {
    await setDoc(doc(adminDb, 'settings', 'labSettings'), s);
    return { success: true };
}

export async function getLabStudies() {
    const s = await getDocs(collection(adminDb, 'labStudies'));
    return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function updateLabStudies(items: LabStudy[]) {
    const b = writeBatch(adminDb);
    items.forEach(i => b.set(doc(adminDb, 'labStudies', i.id), i));
    await b.commit();
    return { success: true };
}

export async function getXRaySettings() {
    const s = await getDoc(doc(adminDb, 'settings', 'xraySettings'));
    return s.exists() ? serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 0, startTime: '08:00', endTime: '13:00', weekendBookingEnabled: false, password: '123' };
}

export async function updateXRaySettings(s: XRaySettings) {
    await setDoc(doc(adminDb, 'settings', 'xraySettings'), s);
    return { success: true };
}

export async function getXRayStudies() {
    const s = await getDocs(collection(adminDb, 'xrayStudies'));
    return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function updateXRayStudies(items: XRayStudy[]) {
    const b = writeBatch(adminDb);
    items.forEach(i => b.set(doc(adminDb, 'xrayStudies', i.id), i));
    await b.commit();
    return { success: true };
}

export async function getUltrasoundSettings() {
    const s = await getDoc(doc(adminDb, 'settings', 'ultrasoundSettings'));
    return s.exists() ? serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 0, startTime: '08:00', endTime: '13:00', weekendBookingEnabled: false, password: '123' };
}

export async function updateUltrasoundSettings(s: UltrasoundSettings) {
    await setDoc(doc(adminDb, 'settings', 'ultrasoundSettings'), s);
    return { success: true };
}

export async function getUltrasoundStudies() {
    const s = await getDocs(collection(adminDb, 'ultrasoundStudies'));
    return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function updateUltrasoundStudies(items: UltrasoundStudy[]) {
    const b = writeBatch(adminDb);
    items.forEach(i => b.set(doc(adminDb, 'ultrasoundStudies', i.id), i));
    await b.commit();
    return { success: true };
}

export async function getVaccineSettings() {
    const s = await getDoc(doc(adminDb, 'settings', 'vaccineSettings'));
    return s.exists() ? serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 0, startTime: '08:00', endTime: '13:00', weekendBookingEnabled: false, password: '123' };
}

export async function updateVaccineSettings(s: VaccineSettings) {
    await setDoc(doc(adminDb, 'settings', 'vaccineSettings'), s);
    return { success: true };
}

export async function getVaccines() {
    const s = await getDocs(collection(adminDb, 'vaccines'));
    return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function updateVaccines(items: Vaccine[]) {
    const b = writeBatch(adminDb);
    items.forEach(i => b.set(doc(adminDb, 'vaccines', i.id), i));
    await b.commit();
    return { success: true };
}
