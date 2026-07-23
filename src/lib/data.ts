
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
  Supply,
  VoucherItem
} from './definitions';
import { PatientStatus, BookingMode } from './definitions';
import { v4 as uuidv4 } from 'uuid';
import { startOfDay, endOfDay, parseISO, format, isValid, startOfMonth, isSaturday, isSunday, addDays } from 'date-fns';

// Re-export constants and primitives for server-side usage
export { 
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
  adminDb 
};

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

// --- DATA ACCESS FUNCTIONS ---

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

export async function getAppointmentsData() {
    const snap = await getDocs(query(collection(adminDb, 'appointments'), limit(10000)));
    return await hydrateAppointments(snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })));
}

export async function getAppointmentsForClinic(id: string) {
    const snap = await getDocs(query(collection(adminDb, 'appointments'), where('clinicId', '==', id)));
    const apps = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    return await hydrateAppointments(apps);
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

export async function getClinicsData(): Promise<Clinic[]> {
    const snap = await getDocs(collection(adminDb, 'clinics'));
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getColoniasData(): Promise<Colonia[]> {
    const snap = await getDocs(collection(adminDb, 'colonias'));
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getServiceTypesData(): Promise<ServiceType[]> {
    const snap = await getDocs(collection(adminDb, 'serviceTypes'));
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getSpecialtiesData(): Promise<Specialty[]> {
    const snap = await getDocs(collection(adminDb, 'specialties'));
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getHolidaysData(): Promise<Holiday[]> {
    const snap = await getDocs(collection(adminDb, 'holidays'));
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getSpecialActionDaysData(): Promise<SpecialActionDay[]> {
    const snap = await getDocs(collection(adminDb, 'specialActionDays'));
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getDepartmentsData(): Promise<Department[]> {
    const snap = await getDocs(collection(adminDb, 'departments'));
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
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
        total, vigente: total - (bCount + bdCount), 
        bajaTemporal: bCount, bajaDefinitiva: bdCount 
    };
}

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
    return { success: true, data: { appointment: appData, clinic: clinicDoc.data() } };
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
    return { success: true, data: { appointment: appData, study: { name: appointment.studyName, indications: '' } } };
}

export async function saveNewUltrasoundAppointment(appointment: any, patient: any) {
    const patientRef = doc(adminDb, 'patients', patient.curp);
    const appointmentId = uuidv4();
    const batch = writeBatch(adminDb);
    batch.set(patientRef, { ...patient, id: patient.curp, nombreCompleto: generateNombreCompleto(patient) }, { merge: true });
    const appData = { ...appointment, id: appointmentId, patientId: patient.curp, createdAt: new Date().toISOString() };
    batch.set(doc(adminDb, 'ultrasoundAppointments', appointmentId), appData);
    await batch.commit();
    return { success: true, data: { appointment: appData, study: { name: appointment.studyName, indications: '' } } };
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
    const col = type === 'lab' ? 'labAppointments' : type === 'xray' ? 'xrayAppointments' : type === 'ultrasound' ? 'ultrasoundAppointments' : type === 'vaccine' ? 'vaccineAppointments' : 'appointments';
    await updateDoc(doc(adminDb, col, id), { status });
    return { success: true };
}

export async function rescheduleAppointment(id: string, date: string, type: string, time: string) {
    const col = type === 'lab' ? 'labAppointments' : type === 'xray' ? 'xrayAppointments' : type === 'ultrasound' ? 'ultrasoundAppointments' : type === 'vaccine' ? 'vaccineAppointments' : 'appointments';
    await updateDoc(doc(adminDb, col, id), { date, time });
    return { success: true, message: 'Cita reprogramada correctamente.' };
}

export async function cloneAppointment(id: string, date: string, type: string, time: string) {
    const col = type === 'lab' ? 'labAppointments' : type === 'xray' ? 'xrayAppointments' : type === 'ultrasound' ? 'ultrasoundAppointments' : type === 'vaccine' ? 'vaccineAppointments' : 'appointments';
    const s = await getDoc(doc(adminDb, col, id));
    if (!s.exists()) return { success: false, message: 'Cita no encontrada.' };
    const data = s.data();
    const newId = uuidv4();
    const newFolio = `FOL-${uuidv4().split('-')[0].toUpperCase()}`;
    await setDoc(doc(adminDb, col, newId), { ...data, id: newId, date, time, appointmentNumber: newFolio, status: 'Agendada', createdAt: new Date().toISOString() });
    return { success: true, message: 'Nueva cita generada.' };
}

export async function getPatientByCURP(curp: string) {
    const c = curp.toUpperCase().trim();
    let s = await getDoc(doc(adminDb, 'patients', c));
    if (s.exists()) return { success: true, data: serializeData({ ...s.data(), id: s.id }) };
    const snap = await getDocs(query(collection(adminDb, 'patients'), where('curp', '==', c), limit(1)));
    if (!snap.empty) return { success: true, data: serializeData({ ...snap.docs[0].data(), id: snap.docs[0].id }) };
    return { success: false };
}

export async function getConsultationsByPatientId(pid: string) {
    const s = await getDocs(query(collection(adminDb, 'medicalConsultations'), where('patientId', '==', pid)));
    return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id })).sort((a: any, b: any) => String(b.date).localeCompare(String(a.date))));
}

export async function getConsultationByAppointmentId(aid: string) {
    const s = await getDocs(query(collection(adminDb, 'medicalConsultations'), where('appointmentId', '==', aid), limit(1)));
    return s.empty ? null : serializeData({ ...s.docs[0].data(), id: s.docs[0].id });
}

export async function getPrescriptionsByPatientId(pid: string) {
    const s = await getDocs(query(collection(adminDb, 'prescriptions'), where('patientId', '==', pid)));
    return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id })).sort((a: any, b: any) => String(b.date).localeCompare(String(a.date))));
}

export async function getAttendedPatientsForClinic(clinicId: string) {
    const snap = await getDocs(query(collection(adminDb, 'appointments'), where('clinicId', '==', clinicId), where('status', '==', 'Atendido')));
    const pIds = Array.from(new Set(snap.docs.map(d => d.data().patientId)));
    if (pIds.length === 0) return [];
    const pSnap = await getDocs(query(collection(adminDb, 'patients'), where(documentId(), 'in', pIds.slice(0, 30))));
    return serializeData(pSnap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getMedications(): Promise<Medication[]> {
    const snap = await getDocs(query(collection(adminDb, 'medications'), limit(10000)));
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getSupplies(): Promise<Supply[]> {
    const snap = await getDocs(query(collection(adminDb, 'supplies'), limit(10000)));
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getPharmacyVouchers(): Promise<PharmacyVoucher[]> {
    const snap = await getDocs(query(collection(adminDb, 'pharmacyVouchers'), orderBy('createdAt', 'desc'), limit(100)));
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getLabStudies(): Promise<LabStudy[]> {
    const snap = await getDocs(collection(adminDb, 'labStudies'));
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getXRayStudies(): Promise<XRayStudy[]> {
    const snap = await getDocs(collection(adminDb, 'xRayStudies'));
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getUltrasoundStudies(): Promise<UltrasoundStudy[]> {
    const snap = await getDocs(collection(adminDb, 'ultrasoundStudies'));
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getVaccines(): Promise<Vaccine[]> {
    const snap = await getDocs(collection(adminDb, 'vaccines'));
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getLabSettings(): Promise<LabSettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'labSettings'));
    return s.exists() ? serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 5, weekendBookingEnabled: false };
}

export async function getXRaySettings(): Promise<XRaySettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'xraySettings'));
    return s.exists() ? serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 2, startTime: '08:00', endTime: '13:00', weekendBookingEnabled: false };
}

export async function getUltrasoundSettings(): Promise<UltrasoundSettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'ultrasoundSettings'));
    return s.exists() ? serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 2, startTime: '08:00', endTime: '13:00', weekendBookingEnabled: false };
}

export async function getVaccineSettings(): Promise<VaccineSettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'vaccineSettings'));
    return s.exists() ? serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 5, startTime: '08:00', endTime: '13:00', weekendBookingEnabled: false };
}

export async function getPrescriptionHistory(filters: any) {
    let q = query(collection(adminDb, 'prescriptions'), where('status', '==', 'surtida'), orderBy('dispensedAt', 'desc'));
    if (filters.startDate) q = query(q, where('dispensedAt', '>=', filters.startDate));
    if (filters.endDate) q = query(q, where('dispensedAt', '<=', filters.endDate));
    const snap = await getDocs(q);
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getPendingPrescriptions(filters: any) {
    const colRef = collection(adminDb, 'prescriptions');
    let q = query(colRef, where('status', '==', 'pendiente'));
    if (filters.folio) q = query(q, where('folio', '==', filters.folio.toUpperCase()));
    if (filters.clinicId) q = query(q, where('clinicId', '==', filters.clinicId));
    const snap = await getDocs(q);
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function cleanupOldRecords() {
    const dateLimit = startOfMonth(new Date());
    const collections = ['appointments', 'labAppointments', 'xrayAppointments', 'ultrasoundAppointments', 'vaccineAppointments'];
    let deletedCount = 0;
    for (const colName of collections) {
        const snap = await getDocs(query(collection(adminDb, colName), where('date', '<', dateLimit.toISOString())));
        const b = writeBatch(adminDb);
        snap.forEach(d => { b.delete(d.ref); deletedCount++; });
        await b.commit();
    }
    return { success: true, deletedCount };
}

export async function downloadBackupAction() {
    const collections = ['appointments', 'labAppointments', 'xrayAppointments', 'ultrasoundAppointments', 'vaccineAppointments', 'patients', 'clinics'];
    const results: any = {};
    for (const col of collections) {
        const snap = await getDocs(collection(adminDb, col));
        results[col] = snap.docs.map(d => serializeData({ ...d.data(), id: d.id }));
    }
    return { success: true, data: results };
}

export async function getAdminSettingsData(): Promise<AdminSettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'adminSettings'));
    return s.exists() ? serializeData(s.data()) : { password: '' };
}

export async function getArchiveSettings(): Promise<ArchiveSettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'archiveSettings'));
    return s.exists() ? serializeData(s.data()) : { password: '' };
}

export async function getPharmacySettings(): Promise<PharmacySettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'pharmacySettings'));
    return s.exists() ? serializeData(s.data()) : { password: '' };
}

export async function getWarehouseSettings(): Promise<WarehouseSettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'warehouseSettings'));
    return s.exists() ? serializeData(s.data()) : { password: '' };
}

export async function getBISettings(): Promise<BISettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'biSettings'));
    return s.exists() ? serializeData(s.data()) : { password: '' };
}

export async function getAnnouncementsData(): Promise<string[]> {
    const s = await getDoc(doc(adminDb, 'settings', 'announcements'));
    return s.exists() ? s.data()?.messages || [] : [];
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

    return {
        appointments: apps.docs.map(d => serializeData({ ...d.data(), id: d.id })),
        labAppointments: lab.docs.map(d => serializeData({ ...d.data(), id: d.id })),
        xRayAppointments: xr.docs.map(d => serializeData({ ...d.data(), id: d.id })),
        ultrasoundAppointments: us.docs.map(d => serializeData({ ...d.data(), id: d.id })),
        vaccineAppointments: vac.docs.map(d => serializeData({ ...d.data(), id: d.id })),
        clinics: clinics.docs.map(d => serializeData({ ...d.data(), id: d.id })),
        colonias: colonias.docs.map(d => serializeData({ ...d.data(), id: d.id }))
    };
}

export async function getLogsData(): Promise<any[]> {
    const snap = await getDocs(query(collection(adminDb, 'activityLog'), orderBy('timestamp', 'desc'), limit(500)));
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function logActivity(action: string, details: string) {
    await addDoc(collection(adminDb, 'activityLog'), { timestamp: new Date().toISOString(), action, details });
    return { success: true };
}

export async function updateModuleSettings(s: ModuleSettings) {
    await setDoc(doc(adminDb, 'settings', 'moduleSettings'), s);
    return { success: true };
}

export async function updateAdminSettings(s: AdminSettings) {
    await setDoc(doc(adminDb, 'settings', 'adminSettings'), s);
    return { success: true };
}

export async function updateArchiveSettings(s: ArchiveSettings) {
    await setDoc(doc(adminDb, 'settings', 'archiveSettings'), s);
    return { success: true };
}

export async function updatePharmacySettings(s: PharmacySettings) {
    await setDoc(doc(adminDb, 'settings', 'pharmacySettings'), s);
    return { success: true };
}

export async function updateWarehouseSettings(s: WarehouseSettings) {
    await setDoc(doc(adminDb, 'settings', 'warehouseSettings'), s);
    return { success: true };
}

export async function updateBISettings(s: BISettings) {
    await setDoc(doc(adminDb, 'settings', 'biSettings'), s);
    return { success: true };
}

export async function updateAnnouncementsData(messages: string[]) {
    await setDoc(doc(adminDb, 'settings', 'announcements'), { messages });
    return { success: true };
}

export async function savePatient(p: Omit<Patient, 'id'>, id?: string) {
    const patientId = id || p.curp.toUpperCase();
    await setDoc(doc(adminDb, 'patients', patientId), { ...p, id: patientId, nombreCompleto: generateNombreCompleto(p) }, { merge: true });
    return { success: true };
}

export async function updatePatient(id: string, p: Partial<Patient>) {
    await updateDoc(doc(adminDb, 'patients', id), { ...p, nombreCompleto: generateNombreCompleto(p) });
    return { success: true };
}

export async function updatePatientStatus(id: string, status: string) {
    await updateDoc(doc(adminDb, 'patients', id), { status });
    return { success: true };
}

export async function deletePatient(id: string) {
    await deleteDoc(doc(adminDb, 'patients', id));
    return { success: true };
}

export async function deletePatients(ids: string[]) {
    const b = writeBatch(adminDb);
    ids.forEach(id => b.delete(doc(adminDb, 'patients', id)));
    await b.commit();
    return { success: true };
}

export async function bulkInsertPatients(records: any[]) {
    const b = writeBatch(adminDb);
    let added = 0;
    for (const r of records) {
        const curp = String(r.CURP || '').toUpperCase().trim();
        if (!curp) continue;
        const pRef = doc(adminDb, 'patients', curp);
        const pData = {
            id: curp, curp,
            expediente: String(r['No.Expediente'] || ''),
            name: String(r.Nombre || '').toUpperCase(),
            paternalLastName: String(r.Apaterno || '').toUpperCase(),
            maternalLastName: String(r.Amaterno || '').toUpperCase(),
            sex: r.Sexo === 'H' ? 'Hombre' : 'Mujer',
            age: parseInt(r.Edad) || 0,
            birthDate: String(r.FNacimiento || ''),
            birthState: String(r.Estado || '').toUpperCase(),
            phoneNumber: String(r.Telefono || ''),
            coloniaName: String(r.Colonia || '').toUpperCase(),
            status: r.Estatus || PatientStatus.Vigente,
            registrationDate: String(r.FechaApertura || ''),
            derechoAbiencia: String(r.DerechoAbiencia || '').toUpperCase(),
            nombreCompleto: `${r.Nombre} ${r.Apaterno} ${r.Amaterno}`.toUpperCase()
        };
        b.set(pRef, pData, { merge: true });
        added++;
    }
    await b.commit();
    return { success: true, addedCount: added, processedCount: added };
}

export async function applyStatusUpdateChunk(expedientes: string[], status: any) {
    const q = query(collection(adminDb, 'patients'), where('expediente', 'in', expedientes));
    const s = await getDocs(q);
    const b = writeBatch(adminDb);
    s.forEach(d => b.update(d.ref, { status }));
    await b.commit();
    return { success: true, count: s.size };
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
    items.forEach(i => {
        const id = uuidv4();
        b.set(doc(adminDb, 'clinics', id), {
            id, name: String(i.Unidad || '').toUpperCase(),
            doctorName: String(i.Medico || '').toUpperCase(),
            doctorCurp: String(i.CURP || '').toUpperCase(),
            professionalLicense: String(i.Cédula || '').toUpperCase(),
            serviceTypeId: String(i.Categoría || '').toUpperCase(),
            password: '123', dailySlots: 10, startTime: '08:00', endTime: '13:00', bookingMode: BookingMode.Time
        });
    });
    await b.commit();
    return { success: true, processedCount: items.length };
}

export async function updateColonias(items: Colonia[]) {
    const b = writeBatch(adminDb);
    items.forEach(i => b.set(doc(adminDb, 'colonias', i.id), i));
    await b.commit();
    return { success: true };
}

export async function updateServiceTypes(items: ServiceType[]) {
    const b = writeBatch(adminDb);
    items.forEach(i => b.set(doc(adminDb, 'serviceTypes', i.id), i));
    await b.commit();
    return { success: true };
}

export async function updateSpecialties(items: Specialty[]) {
    const b = writeBatch(adminDb);
    items.forEach(i => b.set(doc(adminDb, 'specialties', i.id), i));
    await b.commit();
    return { success: true };
}

export async function updateHolidays(items: Holiday[]) {
    const b = writeBatch(adminDb);
    const s = await getDocs(collection(adminDb, 'holidays'));
    s.forEach(d => b.delete(d.ref));
    items.forEach(i => b.set(doc(adminDb, 'holidays', i.date), i));
    await b.commit();
    return { success: true };
}

export async function updateSpecialActionDays(items: SpecialActionDay[]) {
    const b = writeBatch(adminDb);
    const s = await getDocs(collection(adminDb, 'specialActionDays'));
    s.forEach(d => b.delete(d.ref));
    items.forEach(i => b.set(doc(adminDb, 'specialActionDays', uuidv4()), i));
    await b.commit();
    return { success: true };
}

export async function updateDepartments(items: Department[]) {
    const b = writeBatch(adminDb);
    items.forEach(i => b.set(doc(adminDb, 'departments', i.id), i));
    await b.commit();
    return { success: true };
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
    const expiresAt = addDays(new Date(), 1).toISOString();
    const rx = { ...p, id, folio, status: 'pendiente', expiresAt, createdAt: new Date().toISOString() };
    await setDoc(doc(adminDb, 'prescriptions', id), rx);
    return { success: true, folio, prescription: rx };
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
    for (const i of items) {
        b.update(doc(adminDb, 'medications', i.medicationId), { existencia: increment(-i.quantity) });
    }
    b.update(doc(adminDb, 'prescriptions', id), { status: 'surtida', dispensedAt: new Date().toISOString() });
    await b.commit();
    return { success: true };
}

export async function getPatientPrescriptionsCountTodayAction(pid: string) {
    const start = startOfDay(new Date()).toISOString();
    const end = endOfDay(new Date()).toISOString();
    const q = query(collection(adminDb, 'prescriptions'), where('patientId', '==', pid), where('date', '>=', start), where('date', '<=', end));
    const s = await getCountFromServer(q);
    return s.data().count;
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
    const q = query(collection(adminDb, 'medications'), where('fuenteEtiqueta', '==', source));
    const s = await getDocs(q);
    const b = writeBatch(adminDb);
    s.forEach(d => b.delete(d.ref));
    await b.commit();
    return { success: true, deletedCount: s.size };
}

export async function deleteAllMedications() {
    const s = await getDocs(collection(adminDb, 'medications'));
    const b = writeBatch(adminDb);
    s.forEach(d => b.delete(d.ref));
    await b.commit();
    return { success: true };
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
    const s = await getDocs(collection(adminDb, 'supplies'));
    const b = writeBatch(adminDb);
    s.forEach(d => b.delete(d.ref));
    await b.commit();
    return { success: true };
}

export async function createPharmacyVoucher(v: any) {
    const folio = `VAL-${uuidv4().split('-')[0].toUpperCase()}`;
    const id = uuidv4();
    const b = writeBatch(adminDb);
    v.items.forEach((i: any) => b.update(doc(adminDb, 'medications', i.medicationId), { existencia: increment(-i.quantity) }));
    b.set(doc(adminDb, 'pharmacyVouchers', id), { ...v, id, folio, createdAt: new Date().toISOString() });
    await b.commit();
    return { success: true, folio };
}

export async function updateLabSettings(s: LabSettings) {
    await setDoc(doc(adminDb, 'settings', 'labSettings'), s);
    return { success: true };
}

export async function updateLabStudies(items: LabStudy[]) {
    const b = writeBatch(adminDb);
    const s = await getDocs(collection(adminDb, 'labStudies'));
    s.forEach(d => b.delete(d.ref));
    items.forEach(i => b.set(doc(adminDb, 'labStudies', i.id), i));
    await b.commit();
    return { success: true };
}

export async function updateXRaySettings(s: XRaySettings) {
    await setDoc(doc(adminDb, 'settings', 'xraySettings'), s);
    return { success: true };
}

export async function updateXRayStudies(items: XRayStudy[]) {
    const b = writeBatch(adminDb);
    const s = await getDocs(collection(adminDb, 'xRayStudies'));
    s.forEach(d => b.delete(d.ref));
    items.forEach(i => b.set(doc(adminDb, 'xRayStudies', i.id), i));
    await b.commit();
    return { success: true };
}

export async function updateUltrasoundSettings(s: UltrasoundSettings) {
    await setDoc(doc(adminDb, 'settings', 'ultrasoundSettings'), s);
    return { success: true };
}

export async function updateUltrasoundStudies(items: UltrasoundStudy[]) {
    const b = writeBatch(adminDb);
    const s = await getDocs(collection(adminDb, 'ultrasoundStudies'));
    s.forEach(d => b.delete(d.ref));
    items.forEach(i => b.set(doc(adminDb, 'ultrasoundStudies', i.id), i));
    await b.commit();
    return { success: true };
}

export async function updateVaccineSettings(s: VaccineSettings) {
    await setDoc(doc(adminDb, 'settings', 'vaccineSettings'), s);
    return { success: true };
}

export async function updateVaccines(items: Vaccine[]) {
    const b = writeBatch(adminDb);
    const s = await getDocs(collection(adminDb, 'vaccines'));
    s.forEach(d => b.delete(d.ref));
    items.forEach(i => b.set(doc(adminDb, 'vaccines', i.id), i));
    await b.commit();
    return { success: true };
}

export async function getAvailableSlotsForDate(serviceId: string, dateIso: string) {
    const dateStr = dateIso.split('T')[0];
    const holidays = await getHolidaysData();
    const isHoliday = holidays.some(h => h.date === dateStr);
    const date = parseISO(dateIso);
    const isWeekend = isSaturday(date) || isSunday(date);
    const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const dayName = dayNames[date.getDay()];

    if (serviceId === 'lab') {
        const [settings, apps] = await Promise.all([getLabSettings(), getLabAppointmentsData()]);
        const isClosed = (isHoliday || isWeekend) && !settings.weekendBookingEnabled;
        if (isClosed) return { timeSlots: [] };
        const booked = apps.filter(a => a.date.split('T')[0] === dateStr).map(a => a.time);
        const waitlist = Array.from({ length: settings.waitlistSlots || 0 }, (_, i) => `Espera ${i + 1}`);
        const all = ["Recepción General", ...waitlist];
        return { timeSlots: all.filter(t => t === "Recepción General" ? booked.filter(x => x === t).length < settings.dailySlots : !booked.includes(t)) };
    }
    
    const clinic = await getDoc(doc(adminDb, 'clinics', serviceId));
    if (!clinic.exists()) return { timeSlots: [] };
    const cData = clinic.data() as Clinic;
    const isClosed = (isHoliday || (isWeekend && !cData.weekendBookingEnabled) || (cData.unavailableDates?.includes(dateStr)));
    if (isClosed) return { timeSlots: [] };
    
    const apps = await hydrateAppointments((await getDocs(query(collection(adminDb, 'appointments'), where('clinicId', '==', serviceId), where('date', '>=', startOfDay(date).toISOString()), where('date', '<=', endOfDay(date).toISOString())))).docs.map(d => d.data()));
    
    if (cData.bookingMode === BookingMode.Token) {
        const total = (cData.dailySlots || 15) + (cData.waitlistSlots || 0);
        const bookedTokens = apps.map(a => a.time);
        return { tokens: Array.from({ length: total }, (_, i) => i + 1).filter(t => !bookedTokens.includes(`Ficha ${t}`)) };
    } else {
        const custom = cData.customSchedules?.find(s => s.date === dateStr);
        const end = custom ? custom.endTime : cData.endTime;
        const allSlots = Array.from({ length: 48 }, (_, i) => {
            const h = Math.floor(i / 2), m = (i % 2) * 30;
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        }).filter(s => s >= cData.startTime && s < end && s !== cData.breakTime);
        const booked = apps.map(a => a.time);
        return { timeSlots: allSlots.filter(s => !booked.includes(s)) };
    }
}

export async function getAppointmentCountOnDate(clinicId: string, dateStr: string) {
    const q = query(collection(adminDb, 'appointments'), where('clinicId', '==', clinicId), where('date', '>=', startOfDay(parseISO(dateStr)).toISOString()), where('date', '<=', endOfDay(parseISO(dateStr)).toISOString()));
    const s = await getCountFromServer(q);
    return s.data().count;
}

export async function searchCie10(term: string): Promise<Cie10Record[]> {
    const colRef = collection(adminDb, 'cie10Catalog');
    const q = query(colRef, where('nombre', '>=', term.toUpperCase()), where('nombre', '<=', term.toUpperCase() + '\uf8ff'), limit(50));
    const snap = await getDocs(q);
    if (snap.empty) {
        const qCode = query(colRef, where('catalogKey', '==', term.toUpperCase()), limit(1));
        const snapCode = await getDocs(qCode);
        return serializeData(snapCode.docs.map(d => ({ ...d.data(), id: d.id })));
    }
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function bulkInsertCie10Catalog(items: any[]) {
    const b = writeBatch(adminDb);
    items.forEach(i => {
        const id = uuidv4();
        b.set(doc(adminDb, 'cie10Catalog', id), { ...i, id });
    });
    await b.commit();
    return { success: true, processedCount: items.length };
}

export async function deleteAllCie10Catalog() {
    const s = await getDocs(collection(adminDb, 'cie10Catalog'));
    const b = writeBatch(adminDb);
    s.forEach(d => b.delete(d.ref));
    await b.commit();
    return { success: true };
}

export async function normalizeExpedientesAction() {
    const snap = await getDocs(collection(adminDb, 'patients'));
    const b = writeBatch(adminDb);
    let count = 0;
    snap.forEach(d => {
        const data = d.data();
        let exp = String(data.expediente || '');
        if (exp && exp.length > 0 && exp.length < 5) {
            exp = exp.padStart(5, '0');
            b.update(d.ref, { expediente: exp });
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
        const nc = generateNombreCompleto(data);
        b.update(d.ref, { nombreCompleto: nc });
        count++;
    });
    await b.commit();
    return { success: true, count };
}
