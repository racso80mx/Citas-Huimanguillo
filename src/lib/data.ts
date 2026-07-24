
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
  query,
  where,
  limit,
  orderBy,
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
  Holiday,
  SpecialActionDay,
  Medication,
  AppointmentStatus,
  ActivityLog,
  PrescriptionItem
} from './definitions';
import { PatientStatus, BookingMode } from './definitions';
import { v4 as uuidv4 } from 'uuid';
import { startOfDay, endOfDay, parseISO, startOfMonth, endOfMonth, addDays, subMonths } from 'date-fns';

/**
 * Serializa datos de Firestore a objetos planos para transmisión segura entre servidor y cliente.
 */
export function serializeData(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data.toDate === 'function') return data.toDate().toISOString();
  if (data && typeof data === 'object' && 'seconds' in data && 'nanoseconds' in data) {
    try { return new Date(data.seconds * 1000).toISOString(); } catch (e) { return data; }
  }
  if (Array.isArray(data)) return data.map(item => serializeData(item));
  if (typeof data === 'object' && data.constructor === Object) {
    const serialized: any = {};
    for (const key in data) serialized[key] = serializeData(data[key]);
    return serialized;
  }
  return data;
}

/**
 * Hidrata colecciones de citas con datos de pacientes y clínicas de forma eficiente.
 */
async function hydrateAppointments(appointments: any[]) {
    if (!appointments || appointments.length === 0) return [];
    try {
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
        const clinicsMap: Record<string, any> = {};
        clinicsSnap.forEach(d => { clinicsMap[d.id] = { ...d.data(), id: d.id }; });

        return appointments.map(app => serializeData({
            ...app,
            patient: patientsMap[app.patientId] || { name: 'PACIENTE', curp: app.patientId || 'S/C', phoneNumber: '' },
            clinicName: clinicsMap[app.clinicId]?.name || 'N/A',
            doctorName: clinicsMap[app.clinicId]?.doctorName || 'S/N'
        }));
    } catch (e) { return appointments.map(app => serializeData(app)); }
}

// --- LOGS ---
export async function logActivity(a: string, d: string) {
    const id = uuidv4();
    await setDoc(doc(adminDb, 'activityLog', id), {
        id, action: a, details: d, timestamp: Timestamp.now()
    });
}

export async function getLogsData(): Promise<ActivityLog[]> {
    const q = query(collection(adminDb, 'activityLog'), orderBy('timestamp', 'desc'), limit(500));
    const snap = await getDocs(q);
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

// --- CONFIGURACIÓN ---
export async function getModuleSettings(): Promise<ModuleSettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'moduleSettings'));
    return s.exists() ? serializeData(s.data()) : {
        citasMedicasEnabled: true, laboratorioEnabled: true, rayosXEnabled: true, ultrasoundEnabled: true, vacunasEnabled: true,
        archivoEnabled: true, farmaciaEnabled: true, almacenEnabled: true, archivoConsultaEnabled: true,
        citasMedicasWhatsAppEnabled: true, laboratorioWhatsAppEnabled: true, rayosXWhatsAppEnabled: true,
        ultrasoundWhatsAppEnabled: true, vacunasWhatsAppEnabled: true, archivoWhatsAppEnabled: true
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
    let q = query(colRef, limit(options?.limitNum || 100));
    
    if (options?.searchCurp) {
        q = query(colRef, where('curp', '==', options.searchCurp.toUpperCase().trim()), limit(1));
    } else if (options?.searchExpediente) {
        q = query(colRef, where('expediente', '==', String(options.searchExpediente).trim()), limit(1));
    } else if (options?.searchName) {
        const term = options.searchName.toUpperCase().trim();
        q = query(colRef, where('nombreCompleto', '>=', term), where('nombreCompleto', '<=', term + '\uf8ff'), limit(100));
    }
    
    const snap = await getDocs(q);
    let results = snap.docs.map(d => ({ ...d.data(), id: d.id } as Patient));
    
    if (options?.status && options.status !== 'Total') {
        results = results.filter(p => (p.status || PatientStatus.Vigente) === options.status);
    }
    return serializeData(results);
}

export async function getPatientCounts(): Promise<ArchiveCounts> {
    const coll = collection(adminDb, 'patients');
    const snap = await getDocs(coll);
    const all = snap.docs.map(d => d.data());
    const total = all.length;
    const countBaja = all.filter(p => p.status === PatientStatus.Baja).length;
    const countBajaDef = all.filter(p => p.status === PatientStatus.BajaDefinitiva).length;
    return { total, vigente: total - (countBaja + countBajaDef), bajaTemporal: countBaja, bajaDefinitiva: countBajaDef };
}

export async function savePatient(p: Omit<Patient, 'id'>, id?: string) {
    const curp = String(p.curp || id).toUpperCase().trim();
    const data = { ...p, curp, nombreCompleto: `${p.name} ${p.paternalLastName} ${p.maternalLastName}`.toUpperCase() };
    await setDoc(doc(adminDb, 'patients', curp), data, { merge: true });
    return { success: true };
}

export async function updatePatient(id: string, p: Partial<Patient>) {
    await updateDoc(doc(adminDb, 'patients', id), { ...p, nombreCompleto: `${p.name || ''} ${p.paternalLastName || ''} ${p.maternalLastName || ''}`.toUpperCase().trim() });
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

export async function bulkInsertPatients(items: any[]) {
    const b = writeBatch(adminDb);
    let added = 0; let updated = 0;
    for (const item of items) {
        const curp = String(item.CURP || '').toUpperCase().trim();
        if (!curp) continue;
        const data = {
            curp,
            expediente: String(item['No.Expediente'] || ''),
            name: String(item.Nombre || '').toUpperCase(),
            paternalLastName: String(item.Apaterno || '').toUpperCase(),
            maternalLastName: String(item.Amaterno || '').toUpperCase(),
            nombreCompleto: `${item.Nombre} ${item.Apaterno} ${item.Amaterno}`.toUpperCase(),
            birthDate: String(item.FNacimiento || ''),
            age: parseInt(item.Edad) || 0,
            sex: item.Sexo === 'H' ? 'Hombre' : 'Mujer',
            birthState: String(item.Estado || ''),
            address: String(item.Domicilio || ''),
            coloniaName: String(item.Colonia || ''),
            phoneNumber: String(item.Telefono || ''),
            registrationDate: String(item.FechaApertura || ''),
            status: item.Estatus === 'BAJA' ? PatientStatus.Baja : PatientStatus.Vigente
        };
        b.set(doc(adminDb, 'patients', curp), data, { merge: true });
        added++;
    }
    await b.commit();
    return { success: true, addedCount: added, updatedCount: updated, processedCount: added + updated };
}

// --- CITAS (AGENDA) - OPTIMIZACIÓN FILTRADO HÍBRIDO ---
export async function getAppointmentsData(options?: { startDate?: string, endDate?: string }) {
    const start = options?.startDate ? Timestamp.fromDate(startOfDay(parseISO(options.startDate))) : Timestamp.fromDate(subMonths(new Date(), 1));
    const end = options?.endDate ? Timestamp.fromDate(endOfDay(parseISO(options.endDate))) : Timestamp.fromDate(addDays(new Date(), 60));
    
    const q = query(collection(adminDb, 'appointments'), where('date', '>=', start), where('date', '<=', end), limit(5000));
    const snap = await getDocs(q);
    const results = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    
    return await hydrateAppointments(results);
}

export async function getLabAppointmentsData(options?: { startDate?: string, endDate?: string }) {
    const start = options?.startDate ? Timestamp.fromDate(startOfDay(parseISO(options.startDate))) : Timestamp.fromDate(subMonths(new Date(), 1));
    const end = options?.endDate ? Timestamp.fromDate(endOfDay(parseISO(options.endDate))) : Timestamp.fromDate(addDays(new Date(), 60));
    const q = query(collection(adminDb, 'labAppointments'), where('date', '>=', start), where('date', '<=', end), limit(2000));
    const snap = await getDocs(q);
    const results = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    return await hydrateAppointments(results);
}

export async function getXRayAppointmentsData(options?: { startDate?: string, endDate?: string }) {
    const start = options?.startDate ? Timestamp.fromDate(startOfDay(parseISO(options.startDate))) : Timestamp.fromDate(subMonths(new Date(), 1));
    const end = options?.endDate ? Timestamp.fromDate(endOfDay(parseISO(options.endDate))) : Timestamp.fromDate(addDays(new Date(), 60));
    const q = query(collection(adminDb, 'xrayAppointments'), where('date', '>=', start), where('date', '<=', end), limit(2000));
    const snap = await getDocs(q);
    return await hydrateAppointments(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getUltrasoundAppointmentsData(options?: { startDate?: string, endDate?: string }) {
    const start = options?.startDate ? Timestamp.fromDate(startOfDay(parseISO(options.startDate))) : Timestamp.fromDate(subMonths(new Date(), 1));
    const end = options?.endDate ? Timestamp.fromDate(endOfDay(parseISO(options.endDate))) : Timestamp.fromDate(addDays(new Date(), 60));
    const q = query(collection(adminDb, 'ultrasoundAppointments'), where('date', '>=', start), where('date', '<=', end), limit(2000));
    const snap = await getDocs(q);
    return await hydrateAppointments(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getVaccineAppointmentsData(options?: { startDate?: string, endDate?: string }) {
    const start = options?.startDate ? Timestamp.fromDate(startOfDay(parseISO(options.startDate))) : Timestamp.fromDate(subMonths(new Date(), 1));
    const end = options?.endDate ? Timestamp.fromDate(endOfDay(parseISO(options.endDate))) : Timestamp.fromDate(addDays(new Date(), 60));
    const q = query(collection(adminDb, 'vaccineAppointments'), where('date', '>=', start), where('date', '<=', end), limit(2000));
    const snap = await getDocs(q);
    return await hydrateAppointments(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getAppointmentsForClinic(id: string) {
    const start = Timestamp.fromDate(subMonths(new Date(), 1));
    const q = query(collection(adminDb, 'appointments'), where('date', '>=', start), limit(5000));
    const snap = await getDocs(q);
    const results = snap.docs.map(d => ({...d.data(), id: d.id})).filter((a: any) => a.clinicId === id);
    return await hydrateAppointments(results);
}

export async function deleteAppointment(id: string) { await deleteDoc(doc(adminDb, 'appointments', id)); return { success: true }; }
export async function deleteLabAppointment(id: string) { await deleteDoc(doc(adminDb, 'labAppointments', id)); return { success: true }; }
export async function deleteXRayAppointment(id: string) { await deleteDoc(doc(adminDb, 'xrayAppointments', id)); return { success: true }; }
export async function deleteUltrasoundAppointment(id: string) { await deleteDoc(doc(adminDb, 'ultrasoundAppointments', id)); return { success: true }; }
export async function deleteVaccineAppointment(id: string) { await deleteDoc(doc(adminDb, 'vaccineAppointments', id)); return { success: true }; }

export async function saveNewAppointment(appointment: any, patient: any, isDoubleSlot: boolean, coloniaName?: string) {
    const curp = String(patient.curp).toUpperCase().trim();
    const batch = writeBatch(adminDb);
    batch.set(doc(adminDb, 'patients', curp), { ...patient, curp, nombreCompleto: `${patient.name} ${patient.paternalLastName} ${patient.maternalLastName}`.toUpperCase() }, { merge: true });
    
    const id = uuidv4();
    const appData = { 
        ...appointment, 
        patientId: curp, 
        id, 
        coloniaName, 
        date: Timestamp.fromDate(parseISO(appointment.date)), 
        createdAt: Timestamp.now() 
    };
    batch.set(doc(adminDb, 'appointments', id), appData);
    await batch.commit();
    return { success: true, data: { ...appData, id } };
}

export async function saveNewLabAppointment(a: any, p: any) {
    const curp = String(p.curp).toUpperCase().trim();
    await setDoc(doc(adminDb, 'patients', curp), { ...p, curp, nombreCompleto: `${p.name} ${p.paternalLastName} ${p.maternalLastName}`.toUpperCase() }, { merge: true });
    const id = uuidv4();
    const data = { ...a, patientId: curp, id, date: Timestamp.fromDate(parseISO(a.date)), createdAt: Timestamp.now() };
    await setDoc(doc(adminDb, 'labAppointments', id), data);
    return { success: true, data: { ...data, patient: p } };
}

export async function saveNewXRayAppointment(a: any, p: any) {
    const curp = String(p.curp).toUpperCase().trim();
    await setDoc(doc(adminDb, 'patients', curp), { ...p, curp, nombreCompleto: `${p.name} ${p.paternalLastName} ${p.maternalLastName}`.toUpperCase() }, { merge: true });
    const id = uuidv4();
    const data = { ...a, patientId: curp, id, date: Timestamp.fromDate(parseISO(a.date)), createdAt: Timestamp.now() };
    await setDoc(doc(adminDb, 'xrayAppointments', id), data);
    return { success: true, data: { ...data, patient: p } };
}

export async function saveNewUltrasoundAppointment(a: any, p: any) {
    const curp = String(p.curp).toUpperCase().trim();
    await setDoc(doc(adminDb, 'patients', curp), { ...p, curp, nombreCompleto: `${p.name} ${p.paternalLastName} ${p.maternalLastName}`.toUpperCase() }, { merge: true });
    const id = uuidv4();
    const data = { ...a, patientId: curp, id, date: Timestamp.fromDate(parseISO(a.date)), createdAt: Timestamp.now() };
    await setDoc(doc(adminDb, 'ultrasoundAppointments', id), data);
    return { success: true, data: { ...data, patient: p } };
}

export async function saveNewVaccineAppointment(a: any, p: any) {
    const curp = String(p.curp).toUpperCase().trim();
    await setDoc(doc(adminDb, 'patients', curp), { ...p, curp, nombreCompleto: `${p.name} ${p.paternalLastName} ${p.maternalLastName}`.toUpperCase() }, { merge: true });
    const id = uuidv4();
    const data = { ...a, patientId: curp, id, date: Timestamp.fromDate(parseISO(a.date)), createdAt: Timestamp.now() };
    await setDoc(doc(adminDb, 'vaccineAppointments', id), data);
    return { success: true, data: { ...data, patient: p } };
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

export async function bulkInsertDoctors(items: any[]) {
    const b = writeBatch(adminDb);
    let processed = 0;
    for (const item of items) {
        const id = uuidv4();
        const data: Partial<Clinic> = {
            id,
            doctorName: String(item.Médico || item.Nombre || '').toUpperCase(),
            doctorCurp: String(item.CURP || '').toUpperCase(),
            professionalLicense: String(item.Cédula || '').toUpperCase(),
            name: String(item.Unidad || 'CENTRO DE SALUD').toUpperCase(),
            serviceTypeId: String(item.Categoría || 'CONSULTA EXTERNA').toUpperCase(),
            password: '123',
            dailySlots: 10,
            startTime: '08:00',
            endTime: '13:00',
            bookingMode: BookingMode.Time,
            consultationDuration: 30,
            weekendBookingEnabled: false
        };
        if (data.doctorName) {
            b.set(doc(adminDb, 'clinics', id), data);
            processed++;
        }
    }
    await b.commit();
    return { success: true, processedCount: processed };
}

export async function deleteClinic(id: string) { await deleteDoc(doc(adminDb, 'clinics', id)); return { success: true }; }

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
    items.forEach(i => b.set(doc(adminDb, 'specialActionDays', i.date + '_' + i.clinicType), i));
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

// --- OTROS MÓDULOS (LAB, RX, US, VAC) ---
export async function getLabSettings() {
    const s = await getDoc(doc(adminDb, 'settings', 'labSettings'));
    return s.exists() ? serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 0, weekendBookingEnabled: false, password: '123' };
}
export async function updateLabSettings(s: LabSettings) { await setDoc(doc(adminDb, 'settings', 'labSettings'), s); return { success: true }; }
export async function getLabStudies() { const s = await getDocs(collection(adminDb, 'labStudies')); return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id }))); }
export async function updateLabStudies(items: LabStudy[]) {
    const b = writeBatch(adminDb);
    items.forEach(i => b.set(doc(adminDb, 'labStudies', i.id), i));
    await b.commit(); return { success: true };
}

export async function getXRaySettings() { const s = await getDoc(doc(adminDb, 'settings', 'xraySettings')); return s.exists() ? serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 0, startTime: '08:00', endTime: '13:00', weekendBookingEnabled: false }; }
export async function updateXRaySettings(s: XRaySettings) { await setDoc(doc(adminDb, 'settings', 'xraySettings'), s); return { success: true }; }
export async function getXRayStudies() { const s = await getDocs(collection(adminDb, 'xrayStudies')); return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id }))); }
export async function updateXRayStudies(items: XRayStudy[]) {
    const b = writeBatch(adminDb);
    items.forEach(i => b.set(doc(adminDb, 'xrayStudies', i.id), i));
    await b.commit(); return { success: true };
}

export async function getUltrasoundSettings() { const s = await getDoc(doc(adminDb, 'settings', 'ultrasoundSettings')); return s.exists() ? serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 0, startTime: '08:00', endTime: '13:00', weekendBookingEnabled: false }; }
export async function updateUltrasoundSettings(s: UltrasoundSettings) { await setDoc(doc(adminDb, 'settings', 'ultrasoundSettings'), s); return { success: true }; }
export async function getUltrasoundStudies() { const s = await getDocs(collection(adminDb, 'ultrasoundStudies')); return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id }))); }
export async function updateUltrasoundStudies(items: UltrasoundStudy[]) {
    const b = writeBatch(adminDb);
    items.forEach(i => b.set(doc(adminDb, 'ultrasoundStudies', i.id), i));
    await b.commit(); return { success: true };
}

export async function getVaccineSettings() { const s = await getDoc(doc(adminDb, 'settings', 'vaccineSettings')); return s.exists() ? serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 0, startTime: '08:00', endTime: '13:00', weekendBookingEnabled: false }; }
export async function updateVaccineSettings(s: VaccineSettings) { await setDoc(doc(adminDb, 'settings', 'vaccineSettings'), s); return { success: true }; }
export async function getVaccines() { const s = await getDocs(collection(adminDb, 'vaccines')); return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id }))); }
export async function updateVaccines(items: Vaccine[]) {
    const b = writeBatch(adminDb);
    items.forEach(i => b.set(doc(adminDb, 'vaccines', i.id), i));
    await b.commit(); return { success: true };
}

// --- FARMACIA ---
export async function getMedications() { const s = await getDocs(collection(adminDb, 'medications')); return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id }))); }
export async function bulkInsertMedications(items: any[], source: string = 'IMSS-BIENESTAR') {
    const b = writeBatch(adminDb);
    let processed = 0;
    for (const item of items) {
        const id = uuidv4();
        const data = {
            id,
            claveCuadroBasico: String(item.Clave || item.claveCuadroBasico || '').toUpperCase(),
            descripcion: String(item.Denominación || item.descripcion || '').toUpperCase(),
            existencia: parseInt(item.Existencia || item.existencia) || 0,
            lote: String(item.Lote || item.lote || 'N/A').toUpperCase(),
            fechaCaducidad: String(item.Caducidad || item.fechaCaducidad || 'S/F'),
            fuenteFinanciamiento: source,
            fuenteEtiqueta: source
        };
        b.set(doc(adminDb, 'medications', id), data);
        processed++;
    }
    await b.commit();
    return { success: true, processedCount: processed };
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

export async function getSupplies() { return await getMedications(); }
export async function bulkInsertSupplies(items: any[]) { return await bulkInsertMedications(items, 'ALMACEN'); }
export async function deleteAllSupplies() { return await deleteAllMedications(); }

export async function createPharmacyVoucher(v: any) {
    const id = uuidv4();
    const folio = `VAL-${uuidv4().split('-')[0].toUpperCase()}`;
    const batch = writeBatch(adminDb);
    batch.set(doc(adminDb, 'pharmacyVouchers', id), { ...v, id, folio, createdAt: Timestamp.now() });
    
    for (const item of v.items) {
        batch.update(doc(adminDb, 'medications', item.medicationId), { existencia: increment(-item.quantity) });
    }
    await batch.commit();
    return { success: true, folio };
}
export async function getPharmacyVouchers() {
    const s = await getDocs(query(collection(adminDb, 'pharmacyVouchers'), orderBy('createdAt', 'desc'), limit(100)));
    return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id })));
}

// --- RECETAS Y CONSULTAS ---
export async function createPrescription(p: any) {
    const id = uuidv4();
    const folio = `REC-${uuidv4().split('-')[0].toUpperCase()}`;
    const expiresAt = addDays(new Date(), 1);
    const data = { ...p, id, folio, status: 'pendiente', expiresAt: Timestamp.fromDate(expiresAt), createdAt: Timestamp.now() };
    await setDoc(doc(adminDb, 'prescriptions', id), data);
    return { success: true, folio, prescription: data };
}
export async function updatePrescription(id: string, data: any) {
    await updateDoc(doc(adminDb, 'prescriptions', id), data);
    return { success: true };
}
export async function dispensePrescription(id: string, items: { medicationId: string, quantity: number }[]) {
    const batch = writeBatch(adminDb);
    batch.update(doc(adminDb, 'prescriptions', id), { status: 'surtida', dispensedAt: Timestamp.now() });
    for (const item of items) {
        batch.update(doc(adminDb, 'medications', item.medicationId), { existencia: increment(-item.quantity) });
    }
    await batch.commit();
    return { success: true };
}
export async function getPendingPrescriptions(filters?: { folio?: string, clinicId?: string }) {
    let q = query(collection(adminDb, 'prescriptions'), where('status', '==', 'pendiente'), limit(50));
    if (filters?.folio) q = query(collection(adminDb, 'prescriptions'), where('folio', '==', filters.folio.toUpperCase().trim()));
    const s = await getDocs(q);
    let results = s.docs.map(d => ({ ...d.data(), id: d.id } as Prescription));
    if (filters?.clinicId) results = results.filter(r => r.clinicId === filters.clinicId);
    return serializeData(results);
}
export async function getPrescriptionHistory(options?: { startDate?: string, endDate?: string }) {
    let q = query(collection(adminDb, 'prescriptions'), where('status', '==', 'surtida'), orderBy('dispensedAt', 'desc'), limit(200));
    const s = await getDocs(q);
    return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id })));
}
export async function deletePrescription(id: string) { await deleteDoc(doc(adminDb, 'prescriptions', id)); return { success: true }; }

export async function saveMedicalConsultation(c: any) {
    const id = c.id || uuidv4();
    await setDoc(doc(adminDb, 'medicalConsultations', id), { ...c, id, createdAt: Timestamp.now() }, { merge: true });
    if (c.isFinal) {
        await updateDoc(doc(adminDb, 'appointments', c.appointmentId), { status: 'Atendido' });
    }
    return { success: true, id };
}
export async function getConsultationByAppointmentId(aid: string) {
    const s = await getDocs(query(collection(adminDb, 'medicalConsultations'), where('appointmentId', '==', aid), limit(1)));
    return s.empty ? null : serializeData({ ...s.docs[0].data(), id: s.docs[0].id });
}
export async function deleteMedicalConsultation(id: string) { await deleteDoc(doc(adminDb, 'medicalConsultations', id)); return { success: true }; }

export async function getAttendedPatientsForClinic(cid: string) {
    const s = await getDocs(query(collection(adminDb, 'medicalConsultations'), where('clinicId', '==', cid), limit(500)));
    const patientIds = Array.from(new Set(s.docs.map(d => d.data().patientId)));
    if (patientIds.length === 0) return [];
    const pSnap = await getDocs(query(collection(adminDb, 'patients'), where(documentId(), 'in', patientIds.slice(0, 30))));
    return serializeData(pSnap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getPatientPrescriptionsCountTodayAction(pid: string) {
    const start = Timestamp.fromDate(startOfDay(new Date()));
    const q = query(collection(adminDb, 'prescriptions'), where('patientId', '==', pid), where('createdAt', '>=', start));
    const snap = await getDocs(q);
    return snap.size;
}

export async function getConsultationsByPatientId(pid: string) {
    const s = await getDocs(query(collection(adminDb, 'medicalConsultations'), where('patientId', '==', pid), orderBy('createdAt', 'desc'), limit(100)));
    return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getPrescriptionsByPatientId(pid: string) {
    const s = await getDocs(query(collection(adminDb, 'prescriptions'), where('patientId', '==', pid), orderBy('createdAt', 'desc'), limit(100)));
    return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id })));
}

// --- ANUNCIOS ---
export async function getAnnouncementsData(): Promise<string[]> {
    const s = await getDoc(doc(adminDb, 'settings', 'announcements'));
    return s.exists() ? s.data().messages || [] : [];
}
export async function updateAnnouncementsData(messages: string[]) {
    await setDoc(doc(adminDb, 'settings', 'announcements'), { messages });
    return { success: true };
}

// --- CIE-10 ---
export async function searchCie10(term: string): Promise<Cie10Record[]> {
    const q = query(collection(adminDb, 'cie10'), where('nombre', '>=', term.toUpperCase()), where('nombre', '<=', term.toUpperCase() + '\uf8ff'), limit(50));
    const snap = await getDocs(q);
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}
export async function bulkInsertCie10Glossary(items: any[]) {
    const b = writeBatch(adminDb);
    items.forEach(i => { const id = uuidv4(); b.set(doc(adminDb, 'cie10_glossary', id), { ...i, id }); });
    await b.commit(); return { success: true, processedCount: items.length };
}
export async function bulkInsertCie10Catalog(items: any[]) {
    const b = writeBatch(adminDb);
    items.forEach(i => { const id = uuidv4(); b.set(doc(adminDb, 'cie10', id), { ...i, id, nombre: String(i.nombre || '').toUpperCase() }); });
    await b.commit(); return { success: true, processedCount: items.length };
}
export async function deleteAllCie10Glossary() { const s = await getDocs(collection(adminDb, 'cie10_glossary')); const b = writeBatch(adminDb); s.forEach(d => b.delete(d.ref)); await b.commit(); return { success: true }; }
export async function deleteAllCie10Catalog() { const s = await getDocs(collection(adminDb, 'cie10')); const b = writeBatch(adminDb); s.forEach(d => b.delete(d.ref)); await b.commit(); return { success: true }; }

// --- MANTENIMIENTO ---
export async function getAppointmentCountOnDate(clinicId: string, dateStr: string) {
    const start = Timestamp.fromDate(startOfDay(parseISO(dateStr)));
    const end = Timestamp.fromDate(endOfDay(parseISO(dateStr)));
    const q = query(collection(adminDb, 'appointments'), where('date', '>=', start), where('date', '<=', end));
    const snap = await getDocs(q);
    return snap.docs.filter(d => d.data().clinicId === clinicId).length;
}

export async function applyStatusUpdateChunk(expedientes: string[], status: PatientStatus) {
    const q = query(collection(adminDb, 'patients'), where('expediente', 'in', expedientes));
    const snap = await getDocs(q);
    const b = writeBatch(adminDb);
    snap.forEach(d => b.update(d.ref, { status }));
    await b.commit();
    return { success: true, count: snap.size };
}

export async function scanDuplicates(criteria: 'expediente' | 'curp' | 'name') {
    const snap = await getDocs(collection(adminDb, 'patients'));
    const all = snap.docs.map(d => ({ ...d.data(), id: d.id } as Patient));
    const map = new Map<string, Patient[]>();
    all.forEach(p => {
        let key = '';
        if (criteria === 'expediente') key = p.expediente || '';
        else if (criteria === 'curp') key = p.curp;
        else key = `${p.name} ${p.paternalLastName} ${p.maternalLastName}`.toUpperCase();
        if (key && key.length > 2) {
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(p);
        }
    });
    const dupes = Array.from(map.values()).filter(g => g.length > 1);
    return serializeData(dupes);
}

export async function normalizeExpedientesAction() {
    const snap = await getDocs(collection(adminDb, 'patients'));
    const b = writeBatch(adminDb);
    let count = 0;
    snap.forEach(d => {
        const exp = String(d.data().expediente || '');
        if (exp && exp.length > 0 && exp.length < 5) {
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
        const nc = `${data.name} ${data.paternalLastName} ${data.maternalLastName}`.toUpperCase().trim();
        b.update(d.ref, { nombreCompleto: nc });
        count++;
    });
    await b.commit();
    return { success: true, count };
}

export async function cleanupOldRecords() {
    const limitDate = Timestamp.fromDate(subMonths(new Date(), 2));
    const collections = ['appointments', 'labAppointments', 'xrayAppointments', 'ultrasoundAppointments', 'vaccineAppointments', 'activityLog'];
    let total = 0;
    for (const c of collections) {
        const snap = await getDocs(collection(adminDb, c));
        const b = writeBatch(adminDb);
        let batchCount = 0;
        snap.forEach(d => {
            const date = d.data().date;
            if (date && date < limitDate) {
                b.delete(d.ref);
                batchCount++;
            }
        });
        await b.commit();
        total += batchCount;
    }
    return { success: true, deletedCount: total };
}

export async function downloadBackupAction() {
    const collections = ['patients', 'appointments', 'labAppointments', 'xrayAppointments', 'ultrasoundAppointments', 'vaccineAppointments', 'clinics'];
    const result: any = {};
    for (const c of collections) {
        const snap = await getDocs(collection(adminDb, c));
        result[c] = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    }
    return { success: true, data: serializeData(result) };
}

export async function getAvailableSlotsForDate(clinicId: string, dateIso: string) {
    const start = Timestamp.fromDate(startOfDay(parseISO(dateIso)));
    const end = Timestamp.fromDate(endOfDay(parseISO(dateIso)));
    const q = query(collection(adminDb, 'appointments'), where('date', '>=', start), where('date', '<=', end));
    const snap = await getDocs(q);
    const booked = snap.docs.map(d => d.data()).filter((a: any) => a.clinicId === clinicId);
    
    const clinicSnap = await getDoc(doc(adminDb, 'clinics', clinicId));
    if (!clinicSnap.exists()) return { timeSlots: [], tokens: [] };
    const clinic = clinicSnap.data() as Clinic;
    
    if (clinic.bookingMode === BookingMode.Time) {
        const slots: string[] = [];
        let curr = new Date(`1970-01-01T${clinic.startTime || '08:00'}:00`);
        const endH = new Date(`1970-01-01T${clinic.endTime || '14:00'}:00`);
        while (curr < endH) {
            const t = curr.toTimeString().substring(0, 5);
            if (!booked.some((a: any) => a.time === t)) slots.push(t);
            curr = new Date(curr.getTime() + (clinic.consultationDuration || 30) * 60000);
        }
        return { timeSlots: slots };
    } else {
        const total = (clinic.dailySlots || 15) + (clinic.waitlistSlots || 0);
        const free: number[] = [];
        for (let i = 1; i <= total; i++) {
            if (!booked.some((a: any) => a.time === `Ficha ${i}`)) free.push(i);
        }
        return { tokens: free };
    }
}
