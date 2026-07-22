
'use server';

import { revalidatePath } from 'next/cache';
import * as data from './data';
import type { 
    Patient, 
    Appointment, 
    Holiday, 
    SpecialActionDay, 
    LabStudy, 
    LabSettings,
    XRayStudy, 
    XRaySettings,
    UltrasoundStudy, 
    UltrasoundSettings,
    Vaccine, 
    VaccineSettings,
    ModuleSettings,
    AdminSettings,
    ArchiveSettings,
    PharmacySettings,
    WarehouseSettings,
    BISettings,
    Clinic,
    Colonia,
    ServiceType,
    Specialty,
    Prescription,
    PharmacyVoucher,
    Department
} from './definitions';

// --- LOGS ---
export async function logActivity(a: string, d: string) { return data.logActivity(a, d); }
export async function getLogs() { return data.getLogsData(); }

// --- MÓDULOS ---
export async function getModuleSettings() { return data.getModuleSettings(); }
export async function updateModuleSettings(s: ModuleSettings) { 
    const res = await data.updateModuleSettings(s);
    revalidatePath('/', 'layout');
    return res;
}

// --- VERIFICACIONES ---
export async function verifyCitasMedicasPassword(p: string) { return data.verifyModulePassword('medical', p); }
export async function verifyArchivePassword(p: string) { return data.verifyModulePassword('archive', p); }
export async function verifyPharmacyPassword(p: string) { return data.verifyModulePassword('pharmacy', p); }
export async function verifyWarehousePassword(p: string) { return data.verifyModulePassword('warehouse', p); }
export async function verifyBIPassword(p: string) { return data.verifyModulePassword('bi', p); }
export async function verifyLabPassword(p: string) { return data.verifyModulePassword('lab', p); }
export async function verifyXRayPassword(p: string) { return data.verifyModulePassword('xray', p); }
export async function verifyUltrasoundPassword(p: string) { return data.verifyModulePassword('ultrasound', p); }
export async function verifyVaccinePassword(p: string) { return data.verifyModulePassword('vaccine', p); }
export async function verifyAdminPassword(p: string) { return data.verifyModulePassword('superadmin', p); }
export async function verifyClinicPassword(id: string, p: string) { return data.verifyClinicPassword(id, p); }

// --- PACIENTES ---
export async function getPatients(o?: any) { return data.getPatientsData(o); }
export async function getPatientCounts() { return data.getPatientCounts(); }
export async function savePatient(p: Omit<Patient, 'id'>, id?: string) { 
    const res = await data.savePatient(p, id);
    revalidatePath('/', 'layout');
    return res;
}
export async function updatePatient(id: string, p: Partial<Patient>) { 
    const res = await data.updatePatient(id, p);
    revalidatePath('/', 'layout');
    return res;
}
export async function updatePatientStatus(id: string, s: string) { 
    const res = await data.updatePatientStatus(id, s);
    revalidatePath('/', 'layout');
    return res;
}
export async function deletePatient(id: string) { return data.deletePatient(id); }
export async function deletePatients(ids: string[]) { return data.deletePatients(ids); }
export async function getPatientByCURP(c: string) { return data.getPatientByCURP(c); }
export async function bulkInsertPatients(p: any[]) { 
    const res = await data.bulkInsertPatients(p);
    revalidatePath('/', 'layout');
    return res;
}
export async function rebuildNombreCompletoAction() { return data.rebuildNombreCompletoAction(); }
export async function applyStatusUpdateChunk(e: string[], s: any) { return data.applyStatusUpdateChunk(e, s); }

// --- CITAS ---
export async function getAppointments() { return data.getAppointmentsData(); }
export async function getLabAppointments() { return data.getLabAppointmentsData(); }
export async function getXRayAppointments() { return data.getXRayAppointmentsData(); }
export async function getUltrasoundAppointments() { return data.getUltrasoundAppointmentsData(); }
export async function getVaccineAppointments() { return data.getVaccineAppointmentsData(); }
export async function getAvailableSlotsForDate(cid: string, d: string) { return data.getAvailableSlotsForDate(cid, d); }
export async function getAppointmentCountOnDate(cid: string, d: string) { return data.getAppointmentCountOnDate(cid, d); }

export async function updateAppointmentStatus(id: string, status: string, type: string) { 
    const res = await data.updateAppointmentStatus(id, status, type);
    revalidatePath('/', 'layout');
    return res;
}
export async function deleteAppointment(id: string) { 
    const res = await data.deleteAppointment(id);
    revalidatePath('/', 'layout');
    return res;
}
export async function deleteLabAppointment(id: string) { 
    const res = await data.deleteLabAppointment(id);
    revalidatePath('/', 'layout');
    return res;
}
export async function deleteXRayAppointment(id: string) { 
    const res = await data.deleteXRayAppointment(id);
    revalidatePath('/', 'layout');
    return res;
}
export async function deleteUltrasoundAppointment(id: string) { 
    const res = await data.deleteUltrasoundAppointment(id);
    revalidatePath('/', 'layout');
    return res;
}
export async function deleteVaccineAppointment(id: string) { 
    const res = await data.deleteVaccineAppointment(id);
    revalidatePath('/', 'layout');
    return res;
}

// --- CONFIG ---
export async function getAdminSettingsData() {
    const s = await data.getDoc(data.doc(data.adminDb, 'settings', 'adminSettings'));
    return s.exists() ? data.serializeData(s.data()) : { password: 'Hu1m4ngu1ll0' };
}
export async function updateAdminSettings(s: AdminSettings) { await data.setDoc(data.doc(data.adminDb, 'settings', 'adminSettings'), s, { merge: true }); return { success: true }; }
export async function getArchiveSettings() {
    const s = await data.getDoc(data.doc(data.adminDb, 'settings', 'archiveSettings'));
    return s.exists() ? data.serializeData(s.data()) : { password: '123' };
}
export async function updateArchiveSettings(s: ArchiveSettings) { await data.setDoc(data.doc(data.adminDb, 'settings', 'archiveSettings'), s, { merge: true }); return { success: true }; }
export async function getPharmacySettings() {
    const s = await data.getDoc(data.doc(data.adminDb, 'settings', 'pharmacySettings'));
    return s.exists() ? data.serializeData(s.data()) : { password: '123' };
}
export async function updatePharmacySettings(s: PharmacySettings) { await data.setDoc(data.doc(data.adminDb, 'settings', 'pharmacySettings'), s, { merge: true }); return { success: true }; }
export async function getWarehouseSettings() {
    const s = await data.getDoc(data.doc(data.adminDb, 'settings', 'warehouseSettings'));
    return s.exists() ? data.serializeData(s.data()) : { password: '123' };
}
export async function updateWarehouseSettings(s: WarehouseSettings) { await data.setDoc(data.doc(data.adminDb, 'settings', 'warehouseSettings'), s, { merge: true }); return { success: true }; }
export async function getBISettings() {
    const s = await data.getDoc(data.doc(data.adminDb, 'settings', 'biSettings'));
    return s.exists() ? data.serializeData(s.data()) : { password: '123' };
}
export async function updateBISettings(s: BISettings) { await data.setDoc(data.doc(data.adminDb, 'settings', 'biSettings'), s, { merge: true }); return { success: true }; }

// --- CATALOGOS ---
export async function getClinics() { return data.getClinicsData(); }
export async function getHolidays() { return data.getHolidaysData(); }
export async function updateHolidays(h: Holiday[]) {
    const col = data.collection(data.adminDb, 'holidays');
    const b = data.writeBatch(data.adminDb);
    const existing = await data.getDocs(col);
    existing.forEach(d => b.delete(d.ref));
    h.forEach(x => b.set(data.doc(data.adminDb, 'holidays', x.date), x));
    await b.commit(); return { success: true };
}
export async function getSpecialActionDays() {
    const s = await data.getDocs(data.collection(data.adminDb, 'specialActionDays'));
    return data.serializeData(s.docs.map(d => ({ ...d.data(), id: d.id })));
}
export async function updateSpecialActionDays(items: SpecialActionDay[]) {
    const col = data.collection(data.adminDb, 'specialActionDays');
    const b = data.writeBatch(data.adminDb);
    const existing = await data.getDocs(col);
    existing.forEach(d => b.delete(d.ref));
    items.forEach(x => b.set(data.doc(data.adminDb, 'specialActionDays', `${x.date}_${x.clinicType}`), x));
    await b.commit(); return { success: true };
}
export async function getColonias() { return data.getColoniasData(); }
export async function updateColonias(c: Colonia[]) {
    const col = data.collection(data.adminDb, 'colonias');
    const b = data.writeBatch(data.adminDb);
    const existing = await data.getDocs(col);
    existing.forEach(d => b.delete(d.ref));
    c.forEach(x => b.set(data.doc(data.adminDb, 'colonias', x.id), x));
    await b.commit(); return { success: true };
}
export async function getAnnouncements() {
    const s = await data.getDoc(data.doc(data.adminDb, 'settings', 'announcements'));
    return s.exists() ? (s.data()?.messages || []) : [];
}
export async function updateAnnouncements(m: string[]) { await data.setDoc(data.doc(data.adminDb, 'settings', 'announcements'), { messages: m }); return { success: true }; }
export async function getServiceTypes() { return data.getServiceTypesData(); }
export async function updateServiceTypes(t: any[]) {
    const col = data.collection(data.adminDb, 'serviceTypes');
    const b = data.writeBatch(data.adminDb);
    const existing = await data.getDocs(col);
    existing.forEach(d => b.delete(d.ref));
    t.forEach(x => b.set(data.doc(data.adminDb, 'serviceTypes', x.id), x));
    await b.commit(); return { success: true };
}
export async function getSpecialties() { return data.getSpecialtiesData(); }
export async function updateSpecialties(t: any[]) {
    const col = data.collection(data.adminDb, 'specialties');
    const b = data.writeBatch(data.adminDb);
    const existing = await data.getDocs(col);
    existing.forEach(d => b.delete(d.ref));
    t.forEach(x => b.set(data.doc(data.adminDb, 'specialties', x.id), x));
    await b.commit(); return { success: true };
}
export async function getDepartments() { return data.getDepartmentsData(); }
export async function updateDepartments(t: Department[]) {
    const col = data.collection(data.adminDb, 'departments');
    const b = data.writeBatch(data.adminDb);
    const existing = await data.getDocs(col);
    existing.forEach(d => b.delete(d.ref));
    t.forEach(x => b.set(data.doc(data.adminDb, 'departments', x.id), x));
    await b.commit(); return { success: true };
}

// --- CONFIG ESPECÍFICA ---
export async function getLabSettings() {
    const s = await data.getDoc(data.doc(data.adminDb, 'settings', 'labSettings'));
    return s.exists() ? data.serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 0, weekendBookingEnabled: false, startTime: '08:00', endTime: '13:00' };
}
export async function updateLabSettings(s: LabSettings) { await data.setDoc(data.doc(data.adminDb, 'settings', 'labSettings'), s, { merge: true }); return { success: true }; }
export async function getXRaySettings() {
    const s = await data.getDoc(data.doc(data.adminDb, 'settings', 'xraySettings'));
    return s.exists() ? data.serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 0, weekendBookingEnabled: false, startTime: '08:00', endTime: '13:00' };
}
export async function updateXRaySettings(s: XRaySettings) { await data.setDoc(data.doc(data.adminDb, 'settings', 'xraySettings'), s, { merge: true }); return { success: true }; }
export async function getUltrasoundSettings() {
    const s = await data.getDoc(data.doc(data.adminDb, 'settings', 'ultrasoundSettings'));
    return s.exists() ? data.serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 0, weekendBookingEnabled: false, startTime: '08:00', endTime: '13:00' };
}
export async function updateUltrasoundSettings(s: UltrasoundSettings) { await data.setDoc(data.doc(data.adminDb, 'settings', 'ultrasoundSettings'), s, { merge: true }); return { success: true }; }
export async function getVaccineSettings() {
    const s = await data.getDoc(data.doc(data.adminDb, 'settings', 'vaccineSettings'));
    return s.exists() ? data.serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 0, weekendBookingEnabled: false, startTime: '08:00', endTime: '13:00' };
}
export async function updateVaccineSettings(s: VaccineSettings) { await data.setDoc(data.doc(data.adminDb, 'settings', 'vaccineSettings'), s, { merge: true }); return { success: true }; }

export async function getLabStudies() {
    const s = await data.getDocs(data.collection(data.adminDb, 'labStudies'));
    return data.serializeData(s.docs.map(d => ({ ...d.data(), id: d.id })));
}
export async function updateLabStudies(s: LabStudy[]) {
    const col = data.collection(data.adminDb, 'labStudies');
    const b = data.writeBatch(data.adminDb);
    const existing = await data.getDocs(col);
    existing.forEach(d => b.delete(d.ref));
    s.forEach(x => b.set(data.doc(data.adminDb, 'labStudies', x.id), x));
    await b.commit(); return { success: true };
}
export async function getXRayStudies() {
    const s = await data.getDocs(data.collection(data.adminDb, 'xrayStudies'));
    return data.serializeData(s.docs.map(d => ({ ...d.data(), id: d.id })));
}
export async function updateXRayStudies(s: XRayStudy[]) {
    const col = data.collection(data.adminDb, 'xrayStudies');
    const b = data.writeBatch(data.adminDb);
    const existing = await data.getDocs(col);
    existing.forEach(d => b.delete(d.ref));
    s.forEach(x => b.set(data.doc(data.adminDb, 'xrayStudies', x.id), x));
    await b.commit(); return { success: true };
}
export async function getUltrasoundStudies() {
    const s = await data.getDocs(data.collection(data.adminDb, 'ultrasoundStudies'));
    return data.serializeData(s.docs.map(d => ({ ...d.data(), id: d.id })));
}
export async function updateUltrasoundStudies(s: any[]) {
    const col = data.collection(data.adminDb, 'ultrasoundStudies');
    const b = data.writeBatch(data.adminDb);
    const existing = await data.getDocs(col);
    existing.forEach(d => b.delete(d.ref));
    s.forEach(x => b.set(data.doc(data.adminDb, 'ultrasoundStudies', x.id), x));
    await b.commit(); return { success: true };
}
export async function getVaccines() {
    const s = await data.getDocs(data.collection(data.adminDb, 'vaccines'));
    return data.serializeData(s.docs.map(d => ({ ...d.data(), id: d.id })));
}
export async function updateVaccines(s: any[]) {
    const col = data.collection(data.adminDb, 'vaccines');
    const b = data.writeBatch(data.adminDb);
    const existing = await data.getDocs(col);
    existing.forEach(d => b.delete(d.ref));
    s.forEach(x => b.set(data.doc(data.adminDb, 'vaccines', x.id), x));
    await b.commit(); return { success: true };
}

// --- CONSULTAS Y RECETAS ---
export async function getConsultationsByPatientId(pid: string) { return data.getConsultationsByPatientId(pid); }
export async function saveMedicalConsultation(c: any) { return data.saveMedicalConsultation(c); }
export async function createPrescription(p: any) { return data.createPrescription(p); }
export async function dispensePrescription(id: string, items: any[]) { return data.dispensePrescription(id, items); }
export async function deletePrescription(id: string) { await data.deleteDoc(data.doc(data.adminDb, 'prescriptions', id)); return { success: true }; }
export async function getPrescriptionsByPatientId(pid: string) {
    const s = await data.getDocs(data.query(data.collection(data.adminDb, 'prescriptions'), data.where('patientId', '==', pid)));
    return data.serializeData(s.docs.map(d => ({ ...d.data(), id: d.id })));
}
export async function deleteMedicalConsultation(id: string) { await data.deleteDoc(data.doc(data.adminDb, 'medicalConsultations', id)); return { success: true }; }

// --- FARMACIA ---
export async function getMedications() { return data.getMedications(); }
export async function bulkInsertMedications(p: any[], s: string) { return data.bulkInsertMedications(p, s); }
export async function deleteMedicationsBySource(s: string) { return data.deleteMedicationsBySource(s); }
export async function getVouchers() { return data.getPharmacyVouchers(); }
export async function createVoucher(v: any) { return data.createPharmacyVoucher(v); }

// --- MANTENIMIENTO ---
export async function cleanupOldRecords() { return data.cleanupOldRecords(); }
export async function downloadBackupAction() { return data.downloadBackupAction(); }

// --- GUARDADO ESPECIALIZADO CITAS ---
export async function saveNewLabAppointment(a: any, p: any) { return data.saveNewLabAppointment(a, p); }
export async function saveNewXRayAppointment(a: any, p: any) { return data.saveNewXRayAppointment(a, p); }
export async function saveNewUltrasoundAppointment(a: any, p: any) { return data.saveNewUltrasoundAppointment(a, p); }
export async function saveNewVaccineAppointment(a: any, p: any) { return data.saveNewVaccineAppointment(a, p); }
export async function saveNewAppointment(a: any, p: any, d: boolean, c?: string) { return data.saveNewAppointment(a, p, d, c); }

export async function getPrescriptionHistory(filters: any) { return data.getPrescriptionHistory(filters); }
export async function getPatientPrescriptionsCountTodayAction(pid: string) { return data.getPatientPrescriptionsCountTodayAction(pid); }

export async function rescheduleAppointment(id: string, date: string, type: string, time: string) {
    const col = { lab: 'labAppointments', xray: 'xrayAppointments', ultrasound: 'ultrasoundAppointments', vaccine: 'vaccineAppointments' }[type] || 'appointments';
    await data.updateDoc(data.doc(data.adminDb, col, id), { date, time });
    return { success: true, message: 'Cita reprogramada correctamente.' };
}

export async function cloneAppointment(id: string, date: string, type: string, time: string) {
    const col = { lab: 'labAppointments', xray: 'xrayAppointments', ultrasound: 'ultrasoundAppointments', vaccine: 'vaccineAppointments' }[type] || 'appointments';
    const oldDoc = await data.getDoc(data.doc(data.adminDb, col, id));
    if (!oldDoc.exists()) return { success: false, message: 'Cita original no encontrada.' };
    const newData = { ...oldDoc.data(), date, time, appointmentNumber: `${oldDoc.data()?.appointmentNumber}-N`, status: 'Agendada', createdAt: new Date().toISOString() };
    delete newData.id;
    await data.addDoc(data.collection(data.adminDb, col), newData);
    return { success: true, message: 'Nueva cita asignada correctamente.' };
}

export async function searchCie10(t: string) { return data.searchCie10(t); }
export async function getAppointmentsForClinic(id: string) { return hydrateAppointments((await data.getDocs(data.query(data.collection(data.adminDb, 'appointments'), data.where('clinicId', '==', id)))).docs.map(d => ({...serializeData(d.data()), id: d.id}))); }
export async function getAttendedPatientsForClinic(id: string) { return data.getAttendedPatientsForClinic(id); }
