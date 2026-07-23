
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
  documentId
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
import { startOfDay, endOfDay, parseISO, format, isValid, startOfMonth, isSaturday, isSunday } from 'date-fns';

// Re-export constants needed by Server Actions
export { adminDb };

/**
 * Serializes Firestore data to plain objects for safe transmission via Server Actions.
 */
export function serializeData(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data.toDate === 'function') return data.toDate().toISOString();
  if (data && typeof data === 'object' && 'seconds' in data && 'nanoseconds' in data) {
    return new Timestamp(data.seconds, data.nanoseconds).toDate().toISOString();
  }
  if (data instanceof DocumentReference) return data.id;
  if (Array.isArray(data)) return data.map(serializeData);
  if (typeof data === 'object' && data.constructor === Object) {
    const o: any = {};
    for (const key in data) o[key] = serializeData(data[key]);
    return o;
  }
  return data;
}

function generateNombreCompleto(p: any) {
    const n = (p.name || '').trim();
    const ap = (p.paternalLastName || '').trim();
    const am = (p.maternalLastName || '').trim();
    return `${n} ${ap} ${am}`.replace(/\s+/g, ' ').trim().toUpperCase();
}

function generateDynamicTimeSlots(startTimeStr: string, endTimeStr: string, duration: number): string[] {
    if (!startTimeStr || !endTimeStr || !duration) return [];
    const slots: string[] = [];
    try {
        const start = new Date(`1970-01-01T${startTimeStr}:00`);
        const end = new Date(`1970-01-01T${endTimeStr}:00`);
        let current = start;
        while (current < end) {
            slots.push(current.toTimeString().substring(0, 5));
            current = new Date(current.getTime() + duration * 60000);
        }
    } catch (e) {}
    return slots;
}

/**
 * Hydrates appointment list with patient data and clinic names.
 */
async function hydrateAppointments(appointments: any[]) {
    if (!appointments || appointments.length === 0) return [];
    
    const patientIds = Array.from(new Set(appointments.map(a => a.patientId).filter(Boolean)));
    const patientsMap: Record<string, any> = {};
    
    if (patientIds.length > 0) {
        const CHUNK_SIZE = 30; 
        for (let i = 0; i < patientIds.length; i += CHUNK_SIZE) {
            const chunk = patientIds.slice(i, i + CHUNK_SIZE);
            const snap = await getDocs(query(collection(adminDb, 'patients'), where(documentId(), 'in', chunk)));
            snap.forEach(d => { 
                patientsMap[d.id] = { ...d.data(), id: d.id }; 
            });
        }
    }
    
    const clinicsSnap = await getDocs(collection(adminDb, 'clinics'));
    const clinicsMap: Record<string, string> = {};
    clinicsSnap.forEach(d => { 
        clinicsMap[d.id] = d.data().name; 
    });
    
    return appointments.map(app => ({
        ...app,
        patient: serializeData(patientsMap[app.patientId] || app.patient || { name: 'PACIENTE NO ENCONTRADO', curp: app.patientId }),
        clinicName: clinicsMap[app.clinicId] || app.clinicName || app.clinicId
    }));
}

// --- LOGS ---
export async function logActivity(action: string, details: string) {
    try { await addDoc(collection(adminDb, 'activityLog'), { timestamp: Timestamp.now(), action, details }); } catch (e) {}
    return { success: true };
}
export async function getLogsData() {
    const snap = await getDocs(query(collection(adminDb, 'activityLog'), orderBy('timestamp', 'desc'), limit(500)));
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

// --- GLOBAL SETTINGS ---
export async function getModuleSettings(): Promise<ModuleSettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'moduleSettings'));
    const def: ModuleSettings = {
        citasMedicasEnabled: true, laboratorioEnabled: true, rayosXEnabled: true, ultrasoundEnabled: true, vacunasEnabled: true,
        archivoEnabled: true, farmaciaEnabled: true, almacenEnabled: true, archivoConsultaEnabled: true,
        citasMedicasWhatsAppEnabled: true, laboratorioWhatsAppEnabled: true, rayosXWhatsAppEnabled: true,
        ultrasoundWhatsAppEnabled: true, vacunasWhatsAppEnabled: true, archivoWhatsAppEnabled: true,
        citasMedicasPassword: '123', archivoConsultaPassword: '123'
    };
    return s.exists() ? { ...def, ...serializeData(s.data()) } : def;
}

export async function getAdminSettingsData(): Promise<AdminSettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'adminSettings'));
    return s.exists() ? serializeData(s.data()) : { password: 'admin' };
}

export async function updateAdminSettings(settings: AdminSettings) {
    await setDoc(doc(adminDb, 'settings', 'adminSettings'), settings);
    return { success: true };
}

export async function getArchiveSettings(): Promise<ArchiveSettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'archiveSettings'));
    return s.exists() ? serializeData(s.data()) : { password: '123' };
}

export async function updateArchiveSettings(settings: ArchiveSettings) {
    await setDoc(doc(adminDb, 'settings', 'archiveSettings'), settings);
    return { success: true };
}

export async function getPharmacySettings(): Promise<PharmacySettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'pharmacySettings'));
    return s.exists() ? serializeData(s.data()) : { password: '123' };
}

export async function updatePharmacySettings(settings: PharmacySettings) {
    await setDoc(doc(adminDb, 'settings', 'pharmacySettings'), settings);
    return { success: true };
}

export async function getWarehouseSettings(): Promise<WarehouseSettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'warehouseSettings'));
    return s.exists() ? serializeData(s.data()) : { password: '123' };
}

export async function updateWarehouseSettings(settings: WarehouseSettings) {
    await setDoc(doc(adminDb, 'settings', 'warehouseSettings'), settings);
    return { success: true };
}

export async function getBISettings(): Promise<BISettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'biSettings'));
    return s.exists() ? serializeData(s.data()) : { password: '123' };
}

export async function updateBISettings(settings: BISettings) {
    await setDoc(doc(adminDb, 'settings', 'biSettings'), settings);
    return { success: true };
}

export async function updateModuleSettings(settings: ModuleSettings) {
    await setDoc(doc(adminDb, 'settings', 'moduleSettings'), settings);
    return { success: true };
}

// --- BI DATA ---
export async function getBIData() {
    const [apps, lab, xr, us, vac, clinics, colonias] = await Promise.all([
        getAppointmentsData(),
        getLabAppointmentsData(),
        getXRayAppointmentsData(),
        getUltrasoundAppointmentsData(),
        getVaccineAppointmentsData(),
        getClinicsData(),
        getColoniasData()
    ]);
    return {
        appointments: apps,
        labAppointments: lab,
        xRayAppointments: xr,
        ultrasoundAppointments: us,
        vaccineAppointments: vac,
        clinics,
        colonias
    };
}

// --- ANNOUNCEMENTS ---
export async function getAnnouncementsData() {
    const s = await getDoc(doc(adminDb, 'settings', 'announcements'));
    return s.exists() ? (s.data().messages || []) : [];
}

export async function updateAnnouncementsData(messages: string[]) {
    await setDoc(doc(adminDb, 'settings', 'announcements'), { messages });
    return { success: true };
}

// --- PATIENTS ---
export async function getPatientCounts(): Promise<ArchiveCounts> {
    const coll = collection(adminDb, 'patients');
    const totalSnap = await getCountFromServer(coll);
    const total = totalSnap.data().count;
    const [bajaSnap, bajaDefSnap] = await Promise.all([
        getCountFromServer(query(coll, where('status', '==', PatientStatus.Baja))),
        getCountFromServer(query(coll, where('status', '==', PatientStatus.BajaDefinitiva)))
    ]);
    return { 
        total, vigente: total - (bajaSnap.data().count + bajaDefSnap.data().count), 
        bajaTemporal: bajaSnap.data().count, bajaDefinitiva: bajaDefSnap.data().count 
    };
}

export async function getPatientsData(options?: any): Promise<Patient[]> {
    const colRef = collection(adminDb, 'patients');
    let q;
    const MAX_LIMIT = 10000;
    if (options?.searchCurp) q = query(colRef, where('curp', '==', options.searchCurp.toUpperCase().trim()), limit(100));
    else if (options?.searchExpediente) q = query(colRef, where('expediente', '==', String(options.searchExpediente).trim()), limit(100));
    else if (options?.searchName) {
        const term = options.searchName.toUpperCase().trim();
        q = query(colRef, where('nombreCompleto', '>=', term), where('nombreCompleto', '<=', term + '\uf8ff'), limit(MAX_LIMIT));
    } else if (options?.status && options.status !== 'Total') q = query(colRef, where('status', '==', options.status), limit(MAX_LIMIT));
    else q = query(colRef, limit(MAX_LIMIT));
    const snap = await getDocs(q);
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getPatientByCURP(curp: string) {
    const c = curp.toUpperCase().trim();
    let s = await getDoc(doc(adminDb, 'patients', c));
    if (s.exists()) return { success: true, data: serializeData({ ...s.data(), id: s.id }) };
    const snap = await getDocs(query(collection(adminDb, 'patients'), where('curp', '==', c), limit(1)));
    if (!snap.empty) return { success: true, data: serializeData({ ...snap.docs[0].data(), id: snap.docs[0].id }) };
    return { success: false };
}

export async function savePatient(p: Omit<Patient, 'id'>, id?: string) {
  const finalId = p.curp.toUpperCase().trim();
  const batch = writeBatch(adminDb);
  const snapCheck = await getDocs(query(collection(adminDb, 'patients'), where('curp', '==', finalId)));
  snapCheck.forEach(d => { if (d.id !== finalId) batch.delete(d.ref); });
  if (id && id !== finalId) batch.delete(doc(adminDb, 'patients', id));
  const mapped = { ...p, id: finalId, curp: finalId, nombreCompleto: generateNombreCompleto(p) };
  batch.set(doc(adminDb, 'patients', finalId), mapped, { merge: true });
  await batch.commit();
  return { success: true };
}

export async function updatePatient(id: string, p: Partial<Patient>) {
  const finalId = (p.curp || id).toUpperCase().trim();
  const batch = writeBatch(adminDb);
  const snapCheck = await getDocs(query(collection(adminDb, 'patients'), where('curp', '==', finalId)));
  snapCheck.forEach(d => { if (d.id !== finalId) batch.delete(d.ref); });
  const docRefOld = doc(adminDb, 'patients', id);
  const current = await getDoc(docRefOld);
  if (!current.exists()) return { success: false };
  const combined = { ...current.data(), ...p };
  const mapped = { ...combined, id: finalId, curp: finalId, nombreCompleto: generateNombreCompleto(combined) };
  if (id !== finalId) batch.delete(docRefOld);
  batch.set(doc(adminDb, 'patients', finalId), mapped, { merge: true });
  await batch.commit();
  return { success: true };
}

export async function updatePatientStatus(id: string, status: string) { await updateDoc(doc(adminDb, 'patients', id), { status }); return { success: true }; }
export async function deletePatient(id: string) { await deleteDoc(doc(adminDb, 'patients', id)); return { success: true }; }
export async function deletePatients(ids: string[]) {
  const CHUNK_SIZE = 450;
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const batch = writeBatch(adminDb);
    ids.slice(i, i + CHUNK_SIZE).forEach(id => batch.delete(doc(adminDb, 'patients', id)));
    await batch.commit();
  }
  return { success: true, deletedCount: ids.length };
}

export async function bulkInsertPatients(patients: any[]) {
    for (let i = 0; i < patients.length; i += 450) {
        const b = writeBatch(adminDb);
        patients.slice(i, i + 450).forEach(p => {
            const curp = String(p.CURP || p.curp || '').toUpperCase().trim(); if (!curp) return;
            const mapped: any = {
                curp, name: String(p.Nombre || p.name || '').toUpperCase().trim(),
                paternalLastName: String(p.Apaterno || p.paternalLastName || '').toUpperCase().trim(),
                maternalLastName: String(p.Amaterno || p.maternalLastName || '').toUpperCase().trim(),
                expediente: String(p['No.Expediente'] || p.expediente || '').trim(),
                birthDate: String(p.FNacimiento || p.birthDate || '').trim(),
                sex: String(p.Sexo || p.sex || 'H').toUpperCase().startsWith('H') ? 'Hombre' : 'Mujer',
                age: Number(p.Edad || p.age || 0), phoneNumber: String(p.Telefono || p.phoneNumber || '').trim(),
                status: p.Estatus || p.status || PatientStatus.Vigente,
                address: String(p.Domicilio || p.address || '').toUpperCase().trim(),
                coloniaName: String(p.Colonia || p.coloniaName || '').toUpperCase().trim(),
                registrationDate: String(p.FechaApertura || p.registrationDate || '').trim(),
                derechoAbiencia: String(p.DerechoAbiencia || p.derechoAbiencia || '').toUpperCase().trim(),
            };
            mapped.nombreCompleto = generateNombreCompleto(mapped);
            b.set(doc(adminDb, 'patients', curp), mapped, { merge: true });
        });
        await b.commit();
    }
    return { success: true, processedCount: patients.length };
}

export async function applyStatusUpdateChunk(expedientes: string[], status: PatientStatus) {
    const snap = await getDocs(query(collection(adminDb, 'patients'), where('expediente', 'in', expedientes)));
    const batch = writeBatch(adminDb);
    let count = 0;
    snap.forEach(d => { batch.update(d.ref, { status }); count++; });
    await batch.commit();
    return { success: true, count };
}

// --- APPOINTMENTS ---
export async function getAppointmentsData() {
    const snap = await getDocs(query(collection(adminDb, 'appointments'), limit(10000)));
    return await hydrateAppointments(snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })));
}
export async function getLabAppointmentsData() {
    const snap = await getDocs(query(collection(adminDb, 'labAppointments'), limit(10000)));
    return await hydrateAppointments(snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })));
}
export async function getXRayAppointmentsData() {
    const snap = await getDocs(query(collection(adminDb, 'xrayAppointments'), limit(10000)));
    return await hydrateAppointments(snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })));
}
export async function getUltrasoundAppointmentsData() {
    const snap = await getDocs(query(collection(adminDb, 'ultrasoundAppointments'), limit(10000)));
    return await hydrateAppointments(snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })));
}
export async function getVaccineAppointmentsData() {
    const snap = await getDocs(query(collection(adminDb, 'vaccineAppointments'), limit(10000)));
    return await hydrateAppointments(snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })));
}

export async function getAppointmentsForClinic(id: string) {
    const snap = await getDocs(query(collection(adminDb, 'appointments'), where('clinicId', '==', id)));
    const apps = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    return serializeData(await hydrateAppointments(apps));
}

export async function deleteAppointment(id: string) { await deleteDoc(doc(adminDb, 'appointments', id)); return { success: true }; }
export async function deleteLabAppointment(id: string) { await deleteDoc(doc(adminDb, 'labAppointments', id)); return { success: true }; }
export async function deleteXRayAppointment(id: string) { await deleteDoc(doc(adminDb, 'xrayAppointments', id)); return { success: true }; }
export async function deleteUltrasoundAppointment(id: string) { await deleteDoc(doc(adminDb, 'ultrasoundAppointments', id)); return { success: true }; }
export async function deleteVaccineAppointment(id: string) { await deleteDoc(doc(adminDb, 'vaccineAppointments', id)); return { success: true }; }

export async function saveNewAppointment(appointment: any, patient: any, isDoubleSlot: boolean, coloniaName?: string) {
    const patientRef = doc(adminDb, 'patients', patient.curp);
    const appointmentId = uuidv4();
    const appointmentNumber = `FOL-${uuidv4().split('-')[0].toUpperCase()}`;
    
    const batch = writeBatch(adminDb);
    batch.set(patientRef, { ...patient, id: patient.curp, nombreCompleto: generateNombreCompleto(patient) }, { merge: true });
    
    const appData = {
        ...appointment,
        id: appointmentId,
        patientId: patient.curp,
        appointmentNumber,
        coloniaName,
        createdAt: new Date().toISOString()
    };
    
    batch.set(doc(adminDb, 'appointments', appointmentId), appData);
    await batch.commit();
    
    const clinicDoc = await getDoc(doc(adminDb, 'clinics', appointment.clinicId));
    const clinicData = clinicDoc.data();
    return { success: true, data: { appointment: appData, clinic: clinicData } };
}

export async function saveNewLabAppointment(appointment: any, patient: any) {
    const patientRef = doc(adminDb, 'patients', patient.curp);
    const appointmentId = uuidv4();
    const batch = writeBatch(adminDb);
    batch.set(patientRef, { ...patient, id: patient.curp, nombreCompleto: generateNombreCompleto(patient) }, { merge: true });
    const appData = { ...appointment, id: appointmentId, patientId: patient.curp, createdAt: new Date().toISOString() };
    batch.set(doc(adminDb, 'labAppointments', appointmentId), appData);
    await batch.commit();
    return { success: true, data: appData };
}

export async function saveNewXRayAppointment(appointment: any, patient: any) {
    const patientRef = doc(adminDb, 'patients', patient.curp);
    const appointmentId = uuidv4();
    const batch = writeBatch(adminDb);
    batch.set(patientRef, { ...patient, id: patient.curp, nombreCompleto: generateNombreCompleto(patient) }, { merge: true });
    const appData = { ...appointment, id: appointmentId, patientId: patient.curp, createdAt: new Date().toISOString() };
    batch.set(doc(adminDb, 'xrayAppointments', appointmentId), appData);
    await batch.commit();
    const studyDoc = await getDoc(doc(adminDb, 'xRayStudies', appointment.studyId));
    const studyData = studyDoc.data();
    return { success: true, data: { appointment: appData, study: studyData } };
}

export async function saveNewUltrasoundAppointment(appointment: any, patient: any) {
    const patientRef = doc(adminDb, 'patients', patient.curp);
    const appointmentId = uuidv4();
    const batch = writeBatch(adminDb);
    batch.set(patientRef, { ...patient, id: patient.curp, nombreCompleto: generateNombreCompleto(patient) }, { merge: true });
    const appData = { ...appointment, id: appointmentId, patientId: patient.curp, createdAt: new Date().toISOString() };
    batch.set(doc(adminDb, 'ultrasoundAppointments', appointmentId), appData);
    await batch.commit();
    const studyDoc = await getDoc(doc(adminDb, 'ultrasoundStudies', appointment.studyId));
    const studyData = studyDoc.data();
    return { success: true, data: { appointment: appData, study: studyData } };
}

export async function saveNewVaccineAppointment(appointment: any, patient: any) {
    const patientRef = doc(adminDb, 'patients', patient.curp);
    const appointmentId = uuidv4();
    const batch = writeBatch(adminDb);
    batch.set(patientRef, { ...patient, id: patient.curp, nombreCompleto: generateNombreCompleto(patient) }, { merge: true });
    const appData = { ...appointment, id: appointmentId, patientId: patient.curp, createdAt: new Date().toISOString() };
    batch.set(doc(adminDb, 'vaccineAppointments', appointmentId), appData);
    await batch.commit();
    return { success: true, data: appData };
}

export async function updateAppointmentStatus(id: string, status: string, type: string) {
    const colMap: Record<string, string> = {
        'medical': 'appointments', 'lab': 'labAppointments', 'xray': 'xrayAppointments',
        'ultrasound': 'ultrasoundAppointments', 'vaccine': 'vaccineAppointments'
    };
    const colName = colMap[type] || 'appointments';
    await updateDoc(doc(adminDb, colName, id), { status });
    return { success: true };
}

export async function rescheduleAppointment(id: string, date: string, type: string, time: string) {
    const colMap: Record<string, string> = {
        'medical': 'appointments', 'lab': 'labAppointments', 'xray': 'xrayAppointments',
        'ultrasound': 'ultrasoundAppointments', 'vaccine': 'vaccineAppointments'
    };
    const colName = colMap[type] || 'appointments';
    await updateDoc(doc(adminDb, colName, id), { date, time });
    return { success: true, message: 'Cita reprogramada exitosamente.' };
}

export async function cloneAppointment(id: string, date: string, type: string, time: string) {
    const colMap: Record<string, string> = {
        'medical': 'appointments', 'lab': 'labAppointments', 'xray': 'xrayAppointments',
        'ultrasound': 'ultrasoundAppointments', 'vaccine': 'vaccineAppointments'
    };
    const colName = colMap[type] || 'appointments';
    const oldDoc = await getDoc(doc(adminDb, colName, id));
    if (!oldDoc.exists()) return { success: false, message: 'Cita original no encontrada.' };
    const data = oldDoc.data();
    const newId = uuidv4();
    const appNum = `${data.appointmentNumber}-N`;
    await setDoc(doc(adminDb, colName, newId), {
        ...data, id: newId, date, time, appointmentNumber: appNum, status: 'Agendada', createdAt: new Date().toISOString()
    });
    return { success: true, message: `Nueva cita asignada con folio ${appNum}` };
}

export async function getAvailableSlotsForDate(serviceOrClinicId: string, dateIso: string) {
    const dateStr = String(dateIso || '').split('T')[0];
    if (!dateStr) return {};

    const holidays = await getHolidaysData();
    const holidaySet = new Set(holidays.map(h => h.date));
    const isSpecialDay = isSaturday(parseISO(dateStr)) || isSunday(parseISO(dateStr)) || holidaySet.has(dateStr);

    if (['lab', 'laboratorio'].includes(serviceOrClinicId.toLowerCase())) {
        const settings = await getLabSettings();
        const snap = await getDocs(query(collection(adminDb, 'labAppointments'), where('date', '>=', startOfDay(parseISO(dateIso)).toISOString()), where('date', '<=', endOfDay(parseISO(dateIso)).toISOString())));
        const booked = snap.docs.map(d => d.data().time);
        if (isSpecialDay && !settings.weekendBookingEnabled) return { timeSlots: [] };
        const waitlist = Array.from({ length: settings.waitlistSlots || 0 }, (_, i) => `Espera ${i + 1}`);
        const options = ["Recepción General", ...waitlist];
        const free = options.filter(opt => opt === "Recepción General" ? booked.filter(t => t === opt).length < settings.dailySlots : !booked.includes(opt));
        return { timeSlots: free };
    }

    if (['xray', 'rayos-x', 'ultrasound', 'ultrasonidos', 'vacunas', 'vaccine'].includes(serviceOrClinicId.toLowerCase())) {
        let settings: any, col = '';
        if (serviceOrClinicId.toLowerCase().includes('xray') || serviceOrClinicId.toLowerCase().includes('rayos')) { settings = await getXRaySettings(); col = 'xrayAppointments'; }
        else if (serviceOrClinicId.toLowerCase().includes('ultra')) { settings = await getUltrasoundSettings(); col = 'ultrasoundAppointments'; }
        else { settings = await getVaccineSettings(); col = 'vaccineAppointments'; }
        
        if (isSpecialDay && !settings.weekendBookingEnabled) return { timeSlots: [] };
        const snap = await getDocs(query(collection(adminDb, col), where('date', '>=', startOfDay(parseISO(dateIso)).toISOString()), where('date', '<=', endOfDay(parseISO(dateIso)).toISOString())));
        const booked = snap.docs.map(d => d.data().time);
        
        const allSlots = generateDynamicTimeSlots(settings.startTime || '08:00', settings.endTime || '13:00', (col === 'vaccineAppointments' ? 10 : 30));
        const waitlist = Array.from({ length: settings.waitlistSlots || 0 }, (_, i) => `Espera ${i + 1}`);
        const free = [...allSlots, ...waitlist].filter(s => !booked.includes(s));
        return { timeSlots: free };
    }

    const clinicDoc = await getDoc(doc(adminDb, 'clinics', serviceOrClinicId));
    if (!clinicDoc.exists()) return {};
    const clinic = { ...clinicDoc.data(), id: clinicDoc.id } as Clinic;
    const snap = await getDocs(query(collection(adminDb, 'appointments'), where('clinicId', '==', serviceOrClinicId), where('date', '>=', startOfDay(parseISO(dateIso)).toISOString()), where('date', '<=', endOfDay(parseISO(dateIso)).toISOString())));
    const booked = snap.docs.map(d => d.data().time);

    if (clinic.bookingMode === BookingMode.Time) {
        const custom = clinic.customSchedules?.find(s => s.date === dateStr);
        const slots = generateDynamicTimeSlots(clinic.startTime, custom?.endTime || clinic.endTime, clinic.consultationDuration || 30);
        const free = slots.filter(s => s !== clinic.breakTime && !booked.includes(s));
        return { timeSlots: free };
    } else {
        const total = (clinic.dailySlots || 15) + (clinic.waitlistSlots || 0);
        const bookedTokens = booked.filter(t => String(t).startsWith('Ficha ')).map(t => parseInt(String(t).split(' ')[1]));
        const free = Array.from({ length: total }, (_, i) => i + 1).filter(t => !bookedTokens.includes(t));
        return { tokens: free };
    }
}

export async function getAppointmentCountOnDate(clinicId: string, date: string) {
    const snap = await getCountFromServer(query(collection(adminDb, 'appointments'), where('clinicId', '==', clinicId), where('date', '>=', startOfDay(parseISO(date)).toISOString()), where('date', '<=', endOfDay(parseISO(date)).toISOString())));
    return snap.data().count;
}

// --- CONSULTATIONS AND PRESCRIPTIONS ---
export async function getConsultationsByPatientId(pid: string) {
    const s = await getDocs(query(collection(adminDb, 'medicalConsultations'), where('patientId', '==', pid)));
    return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id })).sort((a: any, b: any) => String(b.date).localeCompare(String(a.date))));
}
export async function getConsultationByAppointmentId(aid: string) {
    const s = await getDocs(query(collection(adminDb, 'medicalConsultations'), where('appointmentId', '==', aid), limit(1)));
    return s.empty ? null : serializeData({ ...s.docs[0].data(), id: s.docs[0].id });
}
export async function saveMedicalConsultation(c: any) {
    const id = c.id || uuidv4(); await setDoc(doc(adminDb, 'medicalConsultations', id), { ...c, id, createdAt: new Date().toISOString() });
    if (c.isFinal) await updateDoc(doc(adminDb, 'appointments', c.appointmentId), { status: 'Atendido' });
    return { success: true, id };
}
export async function deleteMedicalConsultation(id: string) { await deleteDoc(doc(adminDb, 'medicalConsultations', id)); return { success: true }; }
export async function getAttendedPatientsForClinic(clinicId: string) {
    const snap = await getDocs(query(collection(adminDb, 'appointments'), where('clinicId', '==', clinicId), where('status', '==', 'Atendido')));
    const pIds = Array.from(new Set(snap.docs.map(d => d.data().patientId)));
    if (pIds.length === 0) return [];
    const pSnap = await getDocs(query(collection(adminDb, 'patients'), where(documentId(), 'in', pIds.slice(0, 30))));
    return serializeData(pSnap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function createPrescription(p: any) {
    const id = uuidv4(); const folio = `REC-${uuidv4().split('-')[0].toUpperCase()}`;
    const exp = new Date(); exp.setHours(exp.getHours() + 24);
    await setDoc(doc(adminDb, 'prescriptions', id), { ...p, id, folio, status: 'pendiente', createdAt: new Date().toISOString(), expiresAt: exp.toISOString() });
    return { success: true, folio, prescription: { ...p, id, folio, status: 'pendiente' } };
}
export async function updatePrescription(id: string, data: any) { await updateDoc(doc(adminDb, 'prescriptions', id), { ...data, updatedAt: new Date().toISOString() }); return { success: true }; }
export async function deletePrescription(id: string) { await deleteDoc(doc(adminDb, 'prescriptions', id)); return { success: true }; }
export async function dispensePrescription(id: string, items: any[]) {
    const b = writeBatch(adminDb); items.forEach(i => b.update(doc(adminDb, 'medications', i.medicationId), { existencia: increment(-i.quantity) }));
    b.update(doc(adminDb, 'prescriptions', id), { status: 'surtida', dispensedAt: new Date().toISOString() });
    await b.commit(); return { success: true };
}
export async function getPrescriptionsByPatientId(pid: string) {
    const s = await getDocs(query(collection(adminDb, 'prescriptions'), where('patientId', '==', pid)));
    return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id })).sort((a: any, b: any) => String(b.date).localeCompare(String(a.date))));
}
export async function getPendingPrescriptions(filters: any) {
    const colRef = collection(adminDb, 'prescriptions');
    let q = query(colRef, where('status', '==', 'pendiente'));
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
export async function getPatientPrescriptionsCountTodayAction(patientId: string) {
    const start = startOfDay(new Date()).toISOString();
    const snap = await getCountFromServer(query(collection(adminDb, 'prescriptions'), where('patientId', '==', patientId), where('createdAt', '>=', start)));
    return snap.data().count;
}

// --- MODULE SETTINGS ---
export async function getLabSettings(): Promise<LabSettings> { const s = await getDoc(doc(adminDb, 'settings', 'labSettings')); return s.exists() ? serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 5, weekendBookingEnabled: false }; }
export async function getXRaySettings(): Promise<XRaySettings> { const s = await getDoc(doc(adminDb, 'settings', 'xraySettings')); return s.exists() ? serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 2, startTime: '08:00', endTime: '13:00', weekendBookingEnabled: false }; }
export async function getUltrasoundSettings(): Promise<UltrasoundSettings> { const s = await getDoc(doc(adminDb, 'settings', 'ultrasoundSettings')); return s.exists() ? serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 2, startTime: '08:00', endTime: '13:00', weekendBookingEnabled: false }; }
export async function getVaccineSettings(): Promise<VaccineSettings> { const s = await getDoc(doc(adminDb, 'settings', 'vaccineSettings')); return s.exists() ? serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 5, startTime: '08:00', endTime: '13:00', weekendBookingEnabled: false }; }

export async function updateLabSettings(s: LabSettings) { await setDoc(doc(adminDb, 'settings', 'labSettings'), s, { merge: true }); return { success: true }; }
export async function updateXRaySettings(s: XRaySettings) { await setDoc(doc(adminDb, 'settings', 'xraySettings'), s, { merge: true }); return { success: true }; }
export async function updateUltrasoundSettings(s: UltrasoundSettings) { await setDoc(doc(adminDb, 'settings', 'ultrasoundSettings'), s, { merge: true }); return { success: true }; }
export async function updateVaccineSettings(s: VaccineSettings) { await setDoc(doc(adminDb, 'settings', 'vaccineSettings'), s, { merge: true }); return { success: true }; }

// --- CATALOGS ---
export async function getClinicsData() { return (await getDocs(collection(adminDb, 'clinics'))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }
export async function getColoniasData() { return (await getDocs(collection(adminDb, 'colonias'))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }
export async function getServiceTypesData() { return (await getDocs(collection(adminDb, 'serviceTypes'))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }
export async function getSpecialtiesData() { return (await getDocs(collection(adminDb, 'specialties'))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }
export async function getHolidaysData() { return (await getDocs(collection(adminDb, 'holidays'))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }
export async function getSpecialActionDaysData() { return (await getDocs(collection(adminDb, 'specialActionDays'))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }
export async function getDepartmentsData() { return (await getDocs(collection(adminDb, 'departments'))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }

export async function updateClinics(clinics: Clinic[]) {
    const batch = writeBatch(adminDb);
    clinics.forEach(c => batch.set(doc(adminDb, 'clinics', c.id), c));
    await batch.commit();
    return { success: true };
}
export async function updateColonias(items: Colonia[]) {
    const batch = writeBatch(adminDb);
    items.forEach(i => batch.set(doc(adminDb, 'colonias', i.id), i));
    await batch.commit();
    return { success: true };
}
export async function updateServiceTypes(items: ServiceType[]) {
    const batch = writeBatch(adminDb);
    items.forEach(i => batch.set(doc(adminDb, 'serviceTypes', i.id), i));
    await batch.commit();
    return { success: true };
}
export async function updateSpecialties(items: Specialty[]) {
    const batch = writeBatch(adminDb);
    items.forEach(i => batch.set(doc(adminDb, 'specialties', i.id), i));
    await batch.commit();
    return { success: true };
}
export async function updateHolidays(items: Holiday[]) {
    const batch = writeBatch(adminDb);
    items.forEach(i => batch.set(doc(adminDb, 'holidays', i.date), i));
    await batch.commit();
    return { success: true };
}
export async function updateSpecialActionDays(items: SpecialActionDay[]) {
    const batch = writeBatch(adminDb);
    items.forEach(i => batch.set(doc(adminDb, 'specialActionDays', `${i.date}_${i.clinicType}`), i));
    await batch.commit();
    return { success: true };
}
export async function updateDepartments(items: Department[]) {
    const batch = writeBatch(adminDb);
    items.forEach(i => batch.set(doc(adminDb, 'departments', i.id), i));
    await batch.commit();
    return { success: true };
}
export async function deleteClinic(id: string) { await deleteDoc(doc(adminDb, 'clinics', id)); return { success: true }; }

export async function bulkInsertDoctors(items: any[]) {
    const CHUNK_SIZE = 450;
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        const batch = writeBatch(adminDb);
        items.slice(i, i + CHUNK_SIZE).forEach(item => {
            const id = uuidv4();
            batch.set(doc(adminDb, 'clinics', id), {
                id,
                doctorName: String(item.Médico || item.doctorName || '').toUpperCase().trim(),
                doctorCurp: String(item.CURP || item.doctorCurp || '').toUpperCase().trim(),
                professionalLicense: String(item.Cédula || item.professionalLicense || '').toUpperCase().trim(),
                name: String(item.Unidad || item.name || '').toUpperCase().trim(),
                serviceTypeId: String(item.Categoría || item.serviceTypeId || '').trim(),
                password: 'hospital_default',
                dailySlots: 10,
                waitlistSlots: 0,
                startTime: '08:00',
                endTime: '13:00',
                weekendBookingEnabled: false,
                bookingMode: BookingMode.Time,
                consultationDuration: 30,
                daysOfAction: ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]
            });
        });
        await batch.commit();
    }
    return { success: true, processedCount: items.length };
}

export async function updateLabStudies(items: LabStudy[]) {
    const batch = writeBatch(adminDb);
    items.forEach(i => batch.set(doc(adminDb, 'labStudies', i.id), i));
    await batch.commit();
    return { success: true };
}
export async function getLabStudies() { return (await getDocs(collection(adminDb, 'labStudies'))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }

export async function updateXRayStudies(items: XRayStudy[]) {
    const batch = writeBatch(adminDb);
    items.forEach(i => batch.set(doc(adminDb, 'xRayStudies', i.id), i));
    await batch.commit();
    return { success: true };
}
export async function getXRayStudies() { return (await getDocs(collection(adminDb, 'xRayStudies'))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }

export async function updateUltrasoundStudies(items: UltrasoundStudy[]) {
    const batch = writeBatch(adminDb);
    items.forEach(i => batch.set(doc(adminDb, 'ultrasoundStudies', i.id), i));
    await batch.commit();
    return { success: true };
}
export async function getUltrasoundStudies() { return (await getDocs(collection(adminDb, 'ultrasoundStudies'))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }

export async function updateVaccines(items: Vaccine[]) {
    const batch = writeBatch(adminDb);
    items.forEach(i => batch.set(doc(adminDb, 'vaccines', i.id), i));
    await batch.commit();
    return { success: true };
}
export async function getVaccines() { return (await getDocs(collection(adminDb, 'vaccines'))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }

// --- PHARMACY / WAREHOUSE ---
export async function getMedications() { const snap = await getDocs(query(collection(adminDb, 'medications'), limit(10000))); return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id }))); }
export async function getSupplies() { const snap = await getDocs(query(collection(adminDb, 'supplies'), limit(10000))); return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id }))); }

export async function createPharmacyVoucher(v: any) {
    const id = uuidv4(); const folio = `VALE-${uuidv4().split('-')[0].toUpperCase()}`;
    const batch = writeBatch(adminDb);
    for (const item of v.items) batch.update(doc(adminDb, 'medications', item.medicationId), { existencia: increment(-item.quantity) });
    batch.set(doc(adminDb, 'pharmacyVouchers', id), { ...v, id, folio, createdAt: new Date().toISOString() });
    await batch.commit(); return { success: true, folio };
}
export async function getPharmacyVouchers() { const snap = await getDocs(query(collection(adminDb, 'pharmacyVouchers'), orderBy('createdAt', 'desc'), limit(100))); return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id }))); }

export async function bulkInsertMedications(meds: any[], source: string) {
    const CHUNK_SIZE = 450;
    for (let i = 0; i < meds.length; i += CHUNK_SIZE) {
        const batch = writeBatch(adminDb);
        meds.slice(i, i + CHUNK_SIZE).forEach(m => {
            const id = uuidv4();
            batch.set(doc(adminDb, 'medications', id), {
                ...m, id, fuenteEtiqueta: source, fuenteFinanciamiento: m.fuenteFinanciamiento || source,
                existencia: Number(m.existencia || 0), updatedAt: new Date().toISOString()
            });
        });
        await batch.commit();
    }
    return { success: true, processedCount: meds.length };
}
export async function deleteMedicationsBySource(source: string) {
    const snap = await getDocs(query(collection(adminDb, 'medications'), where('fuenteEtiqueta', '==', source)));
    const batch = writeBatch(adminDb);
    snap.forEach(d => batch.delete(d.ref));
    await batch.commit();
    return { success: true, deletedCount: snap.size };
}
export async function deleteAllMedications() {
    const snap = await getDocs(collection(adminDb, 'medications'));
    const batch = writeBatch(adminDb);
    snap.forEach(d => batch.delete(d.ref));
    await batch.commit();
    return { success: true };
}
export async function bulkInsertSupplies(supplies: any[]) {
    const CHUNK_SIZE = 450;
    for (let i = 0; i < supplies.length; i += CHUNK_SIZE) {
        const batch = writeBatch(adminDb);
        supplies.slice(i, i + CHUNK_SIZE).forEach(s => {
            const id = uuidv4();
            batch.set(doc(adminDb, 'supplies', id), { ...s, id, existencia: Number(s.existencia || 0), updatedAt: new Date().toISOString() });
        });
        await batch.commit();
    }
    return { success: true, processedCount: supplies.length };
}
export async function deleteAllSupplies() {
    const snap = await getDocs(collection(adminDb, 'supplies'));
    const batch = writeBatch(adminDb);
    snap.forEach(d => batch.delete(d.ref));
    await batch.commit();
    return { success: true };
}

// --- CIE-10 ---
export async function bulkInsertCie10Glossary(items: any[]) {
    for (let i = 0; i < items.length; i += 450) {
        const batch = writeBatch(adminDb);
        items.slice(i, i + 450).forEach(item => {
            const id = uuidv4();
            batch.set(doc(adminDb, 'cie10Glossary', id), { ...item, id });
        });
        await batch.commit();
    }
    return { success: true, processedCount: items.length };
}
export async function bulkInsertCie10Catalog(items: any[]) {
    for (let i = 0; i < items.length; i += 450) {
        const batch = writeBatch(adminDb);
        items.slice(i, i + 450).forEach(item => {
            const id = item.catalogKey || uuidv4();
            batch.set(doc(adminDb, 'cie10Catalog', id), { ...item, id });
        });
        await batch.commit();
    }
    return { success: true, processedCount: items.length };
}
export async function deleteAllCie10Glossary() {
    const snap = await getDocs(collection(adminDb, 'cie10Glossary'));
    const batch = writeBatch(adminDb);
    snap.forEach(d => batch.delete(d.ref));
    await batch.commit();
    return { success: true };
}
export async function deleteAllCie10Catalog() {
    const snap = await getDocs(collection(adminDb, 'cie10Catalog'));
    const batch = writeBatch(adminDb);
    snap.forEach(d => batch.delete(d.ref));
    await batch.commit();
    return { success: true };
}
export async function searchCie10(term: string) {
    const t = term.toUpperCase().trim();
    const q = query(collection(adminDb, 'cie10Catalog'), where('nombre', '>=', t), where('nombre', '<=', t + '\uf8ff'), limit(20));
    const snap = await getDocs(q);
    if (snap.empty) {
        const qCode = query(collection(adminDb, 'cie10Catalog'), where('catalogKey', '>=', t), where('catalogKey', '<=', t + '\uf8ff'), limit(20));
        const snapCode = await getDocs(qCode);
        return serializeData(snapCode.docs.map(d => ({ ...d.data(), id: d.id })));
    }
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

// --- MAINTENANCE ---
export async function cleanupOldRecords() {
    const dateLimit = startOfMonth(new Date());
    const [apps, lab, xr, us, vac] = await Promise.all([
        getDocs(query(collection(adminDb, 'appointments'), where('date', '<', dateLimit.toISOString()))),
        getDocs(query(collection(adminDb, 'labAppointments'), where('date', '<', dateLimit.toISOString()))),
        getDocs(query(collection(adminDb, 'xrayAppointments'), where('date', '<', dateLimit.toISOString()))),
        getDocs(query(collection(adminDb, 'ultrasoundAppointments'), where('date', '<', dateLimit.toISOString()))),
        getDocs(query(collection(adminDb, 'vaccineAppointments'), where('date', '<', dateLimit.toISOString())))
    ]);
    const b = writeBatch(adminDb); 
    [...apps.docs, ...lab.docs, ...xr.docs, ...us.docs, ...vac.docs].forEach(d => b.delete(d.ref));
    await b.commit(); 
    return { success: true, deletedCount: apps.size + lab.size + xr.size + us.size + vac.size };
}

export async function downloadBackupAction() {
    try {
        const collections = ['appointments', 'labAppointments', 'xrayAppointments', 'ultrasoundAppointments', 'vaccineAppointments', 'patients', 'clinics'];
        const results: any = {};
        for (const col of collections) {
            const snap = await getDocs(collection(adminDb, col));
            results[col] = snap.docs.map(d => serializeData({ ...d.data(), id: d.id }));
        }
        return { success: true, data: results };
    } catch (e: any) {
        return { success: false, message: e.message };
    }
}

export async function scanDuplicates(criteria: 'expediente' | 'curp' | 'name') {
    const snap = await getDocs(collection(adminDb, 'patients'));
    const patients = snap.docs.map(d => ({ ...d.data(), id: d.id })) as Patient[];
    const map = new Map<string, Patient[]>();
    patients.forEach(p => {
        let key = '';
        if (criteria === 'expediente') key = String(p.expediente || '');
        else if (criteria === 'curp') key = p.curp;
        else key = `${p.name} ${p.paternalLastName} ${p.maternalLastName}`.toUpperCase().trim();
        if (key && key !== 'N/A' && key !== 'S/E') {
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(p);
        }
    });
    return Array.from(map.values()).filter(group => group.length > 1);
}

export async function normalizeExpedientesAction() {
    const snap = await getDocs(collection(adminDb, 'patients'));
    const batch = writeBatch(adminDb);
    let count = 0;
    snap.forEach(d => {
        const data = d.data();
        if (data.expediente && !String(data.expediente).startsWith('0') && String(data.expediente).length < 5) {
            batch.update(d.ref, { expediente: String(data.expediente).padStart(5, '0') });
            count++;
        }
    });
    await batch.commit();
    return { success: true, count };
}

export async function rebuildNombreCompletoAction() {
    const snap = await getDocs(collection(adminDb, 'patients'));
    const batch = writeBatch(adminDb);
    let count = 0;
    snap.forEach(d => {
        const data = d.data();
        const nc = generateNombreCompleto(data);
        batch.update(d.ref, { nombreCompleto: nc });
        count++;
    });
    await batch.commit();
    return { success: true, count };
}
