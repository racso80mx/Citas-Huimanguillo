
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
    Prescription
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
    const res = await data.savePatient(p, id || '');
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

// --- CITAS ---
export async function getAppointments() { return data.getAppointmentsData(); }
export async function getLabAppointments() { return data.getLabAppointmentsData(); }
export async function getXRayAppointments() { return data.getXRayAppointmentsData(); }
export async function getUltrasoundAppointments() { return data.getUltrasoundAppointmentsData(); }
export async function getVaccineAppointments() { return data.getVaccineAppointmentsData(); }
export async function getAvailableSlotsForDate(cid: string, d: string) { return data.getAvailableSlotsForDate(cid, d); }

export async function updateAppointmentStatus(id: string, s: string, t: any) { 
    const res = await data.updateAppointmentStatus(id, s, t);
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

export async function rescheduleAppointment(id: string, d: string, t: any) { return data.rescheduleAppointment(id, d, t); }
export async function cloneAppointment(id: string, d: string, t: any, ti?: string) { return data.cloneAppointment(id, d, t, ti); }
export async function saveNewAppointment(a: any, p: any, isD: boolean, c?: string) { return data.saveNewAppointment(a, p, isD, c); }
export async function getAppointmentsForClinic(cid: string) { return data.getAppointmentsForClinic(cid); }
export async function getAppointmentCountOnDate(cid: string, d: string) { return data.getAppointmentCountOnDate(cid, d); }

// --- CLÍNICAS ---
export async function getClinics() { return data.getClinicsData(); }
export async function updateClinics(c: Clinic[]) { 
    const res = await data.updateClinics(c);
    revalidatePath('/', 'layout');
    return res;
}
export async function deleteClinic(id: string) { return data.deleteClinic(id); }

// --- CONSULTAS Y RECETAS ---
export async function getConsultationsByPatientId(pid: string) { return data.getConsultationsByPatientId(pid); }
export async function saveMedicalConsultation(c: any) { 
    const res = await data.saveMedicalConsultation(c);
    revalidatePath('/', 'layout');
    return res;
}
export async function deleteMedicalConsultation(id: string) { return data.deleteMedicalConsultation(id); }
export async function getConsultationByAppointmentId(aid: string) { return data.getConsultationByAppointmentId(aid); }
export async function getPrescriptionsByPatientId(pid: string) { return data.getPrescriptionsByPatientId(pid); }
export async function createPrescription(p: any) { return data.createPrescription(p); }
export async function updatePrescription(id: string, p: any) { return data.updatePrescription(id, p); }
export async function deletePrescription(id: string) { return data.deletePrescription(id); }
export async function dispensePrescription(id: string, i: any[]) { return data.dispensePrescription(id, i); }
export async function getPendingPrescriptions(f: any) { return data.getPendingPrescriptions(f); }
export async function getPrescriptionHistory(f: any) { return data.getPrescriptionHistory(f); }

// --- CONFIG ---
export async function getAdminSettingsData() { return data.getAdminSettingsData(); }
export async function updateAdminSettings(s: AdminSettings) { return data.updateAdminSettings(s); }
export async function getArchiveSettings() { return data.getArchiveSettings(); }
export async function updateArchiveSettings(s: ArchiveSettings) { return data.updateArchiveSettings(s); }
export async function getPharmacySettings() { return data.getPharmacySettings(); }
export async function updatePharmacySettings(s: PharmacySettings) { return data.updatePharmacySettings(s); }
export async function getWarehouseSettings() { return data.getWarehouseSettings(); }
export async function updateWarehouseSettings(s: WarehouseSettings) { return data.updateWarehouseSettings(s); }
export async function getBISettings() { return data.getBISettings(); }
export async function updateBISettings(s: BISettings) { return data.updateBISettings(s); }

// --- CATÁLOGOS ---
export async function getServiceTypes() { return data.getServiceTypesData(); }
export async function updateServiceTypes(t: any[]) { return data.updateServiceTypes(t); }
export async function getSpecialties() { return data.getSpecialtiesData(); }
export async function updateSpecialties(t: any[]) { return data.updateSpecialties(t); }
export async function getColonias() { return data.getColoniasData(); }
export async function updateColonias(c: Colonia[]) { return data.updateColonias(c); }
export async function getAnnouncements() { return data.getAnnouncementsData(); }
export async function updateAnnouncements(m: string[]) { return data.updateAnnouncements(m); }
export async function getHolidays() { return data.getHolidaysData(); }
export async function updateHolidays(h: Holiday[]) { return data.updateHolidays(h); }
export async function getSpecialActionDays() { return data.getSpecialActionDaysData(); }
export async function updateSpecialActionDays(i: SpecialActionDay[]) { return data.updateSpecialActionDays(i); }

export async function getLabSettings() { return data.getLabSettings(); }
export async function updateLabSettings(s: LabSettings) { return data.updateLabSettings(s); }
export async function getXRaySettings() { return data.getXRaySettings(); }
export async function updateXRaySettings(s: XRaySettings) { return data.updateXRaySettings(s); }
export async function getUltrasoundSettings() { return data.getUltrasoundSettings(); }
export async function updateUltrasoundSettings(s: UltrasoundSettings) { return data.updateUltrasoundSettings(s); }
export async function getVaccineSettings() { return data.getVaccineSettings(); }
export async function updateVaccineSettings(s: VaccineSettings) { return data.updateVaccineSettings(s); }

export async function getLabStudies() { return data.getLabStudies(); }
export async function updateLabStudies(s: LabStudy[]) { return data.updateLabStudies(s); }
export async function getXRayStudies() { return data.getXRayStudies(); }
export async function updateXRayStudies(s: XRayStudy[]) { return data.updateXRayStudies(s); }
export async function getUltrasoundStudies() { return data.getUltrasoundStudies(); }
export async function updateUltrasoundStudies(s: any[]) { return data.updateUltrasoundStudies(s); }
export async function getVaccines() { return data.getVaccines(); }
export async function updateVaccines(s: any[]) { return data.updateVaccines(s); }

export async function getMedications() { return data.getMedications(); }
export async function getSupplies() { return data.getSupplies(); }
export async function bulkInsertMedications(i: any[]) { return data.bulkInsertMedications(i); }
export async function bulkInsertSupplies(i: any[]) { return data.bulkInsertSupplies(i); }
export async function deleteAllMedications() { return data.deleteAllMedications(); }
export async function deleteAllSupplies() { return data.deleteAllSupplies(); }
export async function searchCie10(t: string) { return data.searchCie10(t); }
export async function getBIData() { return data.getBIData(); }
export async function getAttendedPatientsForClinic(c: string) { return data.getAttendedPatientsForClinic(c); }
export async function cleanupOldRecords() { return data.cleanupOldRecords(); }

// --- MANTENIMIENTO Y RESPALDO ---
export async function normalizeExpedientesAction() { return data.normalizeExpedientesAction(); }
export async function scanDuplicates(c: string) { return data.scanDuplicates(c); }
export async function applyStatusUpdateChunk(e: string[], s: string) { return data.applyStatusUpdateChunk(e, s); }
export async function getPatientPrescriptionsCountTodayAction(p: string) { return data.getPatientPrescriptionsCountTodayAction(p); }
export async function bulkInsertCie10Glossary(d: any[]) { return data.bulkInsertCie10Glossary(d); }
export async function bulkInsertCie10Catalog(d: any[]) { return data.bulkInsertCie10Catalog(d); }
export async function deleteAllCie10Glossary() { return data.deleteAllCie10Glossary(); }
export async function deleteAllCie10Catalog() { return data.deleteAllCie10Catalog(); }
export async function bulkInsertDoctors(d: any[]) { return data.bulkInsertDoctors(d); }
export async function downloadBackupAction() { return data.downloadBackupAction(); }
