
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
  BISettings
} from './definitions';
import { PatientStatus, BookingMode } from './definitions';
import { v4 as uuidv4 } from 'uuid';
import { startOfDay, endOfDay, parseISO, startOfMonth, endOfMonth, addDays, subMonths } from 'date-fns';

/**
 * Serializa datos de Firestore para su uso en componentes de servidor y cliente.
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
 * Hidrata las citas con información del paciente y clínica de forma optimizada.
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
    } catch (e) {
        return appointments.map(app => serializeData(app));
    }
}

// --- LOGS ---
export async function logActivity(a: string, d: string) {
    const id = uuidv4();
    await setDoc(doc(adminDb, 'activityLog', id), { id, action: a, details: d, timestamp: Timestamp.now() });
}
export async function getLogsData(): Promise<ActivityLog[]> {
    const q = query(collection(adminDb, 'activityLog'), orderBy('timestamp', 'desc'), limit(300));
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
export async function updateModuleSettings(s: ModuleSettings) { await setDoc(doc(adminDb, 'settings', 'moduleSettings'), s); return { success: true }; }
export async function getAdminSettingsData(): Promise<AdminSettings> { const s = await getDoc(doc(adminDb, 'settings', 'adminSettings')); return s.exists() ? serializeData(s.data()) : { password: '' }; }
export async function updateAdminSettings(s: AdminSettings) { await setDoc(doc(adminDb, 'settings', 'adminSettings'), s); return { success: true }; }
export async function getArchiveSettings(): Promise<ArchiveSettings> { const s = await getDoc(doc(adminDb, 'settings', 'archiveSettings')); return s.exists() ? serializeData(s.data()) : { password: '123' }; }
export async function updateArchiveSettings(s: ArchiveSettings) { await setDoc(doc(adminDb, 'settings', 'archiveSettings'), s); return { success: true }; }
export async function getPharmacySettings(): Promise<PharmacySettings> { const s = await getDoc(doc(adminDb, 'settings', 'pharmacySettings')); return s.exists() ? serializeData(s.data()) : { password: '123' }; }
export async function updatePharmacySettings(s: PharmacySettings) { await setDoc(doc(adminDb, 'settings', 'pharmacySettings'), s); return { success: true }; }
export async function getWarehouseSettings(): Promise<WarehouseSettings> { const s = await getDoc(doc(adminDb, 'settings', 'warehouseSettings')); return s.exists() ? serializeData(s.data()) : { password: '123' }; }
export async function updateWarehouseSettings(s: WarehouseSettings) { await setDoc(doc(adminDb, 'settings', 'warehouseSettings'), s); return { success: true }; }
export async function getBISettings(): Promise<BISettings> { const s = await getDoc(doc(adminDb, 'settings', 'biSettings')); return s.exists() ? serializeData(s.data()) : { password: '123' }; }
export async function updateBISettings(s: BISettings) { await setDoc(doc(adminDb, 'settings', 'biSettings'), s); return { success: true }; }

// --- PACIENTES ---
export async function getPatientsData(options?: any): Promise<Patient[]> {
    const colRef = collection(adminDb, 'patients');
    let q = query(colRef, limit(options?.limitNum || 100));
    if (options?.searchCurp) q = query(colRef, where('curp', '==', options.searchCurp.toUpperCase().trim()), limit(1));
    else if (options?.searchExpediente) q = query(colRef, where('expediente', '==', String(options.searchExpediente).trim()), limit(1));
    else if (options?.searchName) {
        const t = options.searchName.toUpperCase().trim();
        q = query(colRef, where('nombreCompleto', '>=', t), where('nombreCompleto', '<=', t + '\uf8ff'), limit(100));
    }
    const snap = await getDocs(q);
    let results = snap.docs.map(d => ({ ...d.data(), id: d.id } as Patient));
    if (options?.status && options.status !== 'Total') results = results.filter(p => (p.status || PatientStatus.Vigente) === options.status);
    return serializeData(results);
}
export async function getPatientCounts(): Promise<ArchiveCounts> {
    const snap = await getDocs(collection(adminDb, 'patients'));
    const all = snap.docs.map(d => d.data());
    const total = all.length;
    const countBaja = all.filter(p => p.status === PatientStatus.Baja).length;
    const countBajaDef = all.filter(p => p.status === PatientStatus.BajaDefinitiva).length;
    return { total, vigente: total - (countBaja + countBajaDef), bajaTemporal: countBaja, bajaDefinitiva: countBajaDef };
}
export async function savePatient(p: Omit<Patient, 'id'>, id?: string) {
    const curp = String(p.curp || id).toUpperCase().trim();
    const nc = `${p.name} ${p.paternalLastName} ${p.maternalLastName}`.toUpperCase().trim();
    await setDoc(doc(adminDb, 'patients', curp), { ...p, curp, nombreCompleto: nc }, { merge: true });
    return { success: true };
}
export async function updatePatient(id: string, p: Partial<Patient>) {
    const nc = `${p.name || ''} ${p.paternalLastName || ''} ${p.maternalLastName || ''}`.toUpperCase().trim();
    await updateDoc(doc(adminDb, 'patients', id), { ...p, nombreCompleto: nc });
    return { success: true };
}
export async function updatePatientStatus(id: string, status: string) { await updateDoc(doc(adminDb, 'patients', id), { status }); return { success: true }; }
export async function deletePatients(ids: string[]) { const b = writeBatch(adminDb); ids.forEach(id => b.delete(doc(adminDb, 'patients', id))); await b.commit(); return { success: true }; }
export async function getPatientByCURP(c: string) { const snap = await getDoc(doc(adminDb, 'patients', c.toUpperCase().trim())); return snap.exists() ? serializeData({ success: true, data: { ...snap.data(), id: snap.id } }) : { success: false }; }
export async function bulkInsertPatients(items: any[]) {
    const b = writeBatch(adminDb);
    items.forEach(i => {
        const curp = String(i.CURP || '').toUpperCase().trim();
        if (curp) {
            const data = {
                curp, expediente: String(i['No.Expediente'] || ''), name: String(i.Nombre || '').toUpperCase(),
                paternalLastName: String(i.Apaterno || '').toUpperCase(), maternalLastName: String(i.Amaterno || '').toUpperCase(),
                nombreCompleto: `${i.Nombre} ${i.Apaterno} ${i.Amaterno}`.toUpperCase(), sex: i.Sexo === 'H' ? 'Hombre' : 'Mujer',
                age: parseInt(i.Edad) || 0, phoneNumber: String(i.Telefono || ''), status: PatientStatus.Vigente
            };
            b.set(doc(adminDb, 'patients', curp), data, { merge: true });
        }
    });
    await b.commit(); return { success: true, processedCount: items.length };
}

// --- CITAS ---
export async function getAppointmentsData(options?: { startDate?: string, endDate?: string }) {
    const start = options?.startDate ? Timestamp.fromDate(startOfDay(parseISO(options.startDate))) : Timestamp.fromDate(subMonths(new Date(), 1));
    const end = options?.endDate ? Timestamp.fromDate(endOfDay(parseISO(options.endDate))) : Timestamp.fromDate(addDays(new Date(), 60));
    const q = query(collection(adminDb, 'appointments'), where('date', '>=', start), where('date', '<=', end), limit(5000));
    const snap = await getDocs(q);
    return await hydrateAppointments(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}
export async function getLabAppointmentsData(options?: { startDate?: string, endDate?: string }) {
    const start = options?.startDate ? Timestamp.fromDate(startOfDay(parseISO(options.startDate))) : Timestamp.fromDate(subMonths(new Date(), 1));
    const end = options?.endDate ? Timestamp.fromDate(endOfDay(parseISO(options.endDate))) : Timestamp.fromDate(addDays(new Date(), 60));
    const q = query(collection(adminDb, 'labAppointments'), where('date', '>=', start), where('date', '<=', end), limit(1500));
    const snap = await getDocs(q);
    return await hydrateAppointments(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}
export async function getXRayAppointmentsData(options?: { startDate?: string, endDate?: string }) {
    const start = options?.startDate ? Timestamp.fromDate(startOfDay(parseISO(options.startDate))) : Timestamp.fromDate(subMonths(new Date(), 1));
    const end = options?.endDate ? Timestamp.fromDate(endOfDay(parseISO(options.endDate))) : Timestamp.fromDate(addDays(new Date(), 60));
    const q = query(collection(adminDb, 'xrayAppointments'), where('date', '>=', start), where('date', '<=', end), limit(1500));
    const snap = await getDocs(q);
    return await hydrateAppointments(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}
export async function getUltrasoundAppointmentsData(options?: { startDate?: string, endDate?: string }) {
    const start = options?.startDate ? Timestamp.fromDate(startOfDay(parseISO(options.startDate))) : Timestamp.fromDate(subMonths(new Date(), 1));
    const end = options?.endDate ? Timestamp.fromDate(endOfDay(parseISO(options.endDate))) : Timestamp.fromDate(addDays(new Date(), 60));
    const q = query(collection(adminDb, 'ultrasoundAppointments'), where('date', '>=', start), where('date', '<=', end), limit(1500));
    const snap = await getDocs(q);
    return await hydrateAppointments(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}
export async function getVaccineAppointmentsData(options?: { startDate?: string, endDate?: string }) {
    const start = options?.startDate ? Timestamp.fromDate(startOfDay(parseISO(options.startDate))) : Timestamp.fromDate(subMonths(new Date(), 1));
    const end = options?.endDate ? Timestamp.fromDate(endOfDay(parseISO(options.endDate))) : Timestamp.fromDate(addDays(new Date(), 60));
    const q = query(collection(adminDb, 'vaccineAppointments'), where('date', '>=', start), where('date', '<=', end), limit(1500));
    const snap = await getDocs(q);
    return await hydrateAppointments(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}
export async function getAppointmentsForClinic(id: string) {
    const start = Timestamp.fromDate(subMonths(new Date(), 6));
    const q = query(collection(adminDb, 'appointments'), where('date', '>=', start), limit(5000));
    const snap = await getDocs(q);
    const results = snap.docs.map(d => ({ ...d.data(), id: d.id })).filter((a: any) => a.clinicId === id);
    return await hydrateAppointments(results);
}
export async function saveNewAppointment(a: any, p: any, d: boolean, c?: string) {
    const curp = String(p.curp).toUpperCase().trim();
    const batch = writeBatch(adminDb);
    batch.set(doc(adminDb, 'patients', curp), { ...p, curp, nombreCompleto: `${p.name} ${p.paternalLastName} ${p.maternalLastName}`.toUpperCase() }, { merge: true });
    const id = uuidv4();
    const appointmentNumber = `MED-${uuidv4().split('-')[0].toUpperCase()}`;
    const appData = { ...a, patientId: curp, id, appointmentNumber, coloniaName: c, date: Timestamp.fromDate(parseISO(a.date)), createdAt: Timestamp.now() };
    batch.set(doc(adminDb, 'appointments', id), appData);
    await batch.commit(); return { success: true, data: { ...appData, id } };
}
export async function deleteAppointment(id: string) { await deleteDoc(doc(adminDb, 'appointments', id)); return { success: true }; }
export async function deleteLabAppointment(id: string) { await deleteDoc(doc(adminDb, 'labAppointments', id)); return { success: true }; }
export async function deleteXRayAppointment(id: string) { await deleteDoc(doc(adminDb, 'xrayAppointments', id)); return { success: true }; }
export async function deleteUltrasoundAppointment(id: string) { await deleteDoc(doc(adminDb, 'ultrasoundAppointments', id)); return { success: true }; }
export async function deleteVaccineAppointment(id: string) { await deleteDoc(doc(adminDb, 'vaccineAppointments', id)); return { success: true }; }

export async function saveNewLabAppointment(a: any, p: any) {
    const curp = String(p.curp).toUpperCase().trim();
    const batch = writeBatch(adminDb);
    batch.set(doc(adminDb, 'patients', curp), { ...p, curp, nombreCompleto: `${p.name} ${p.paternalLastName} ${p.maternalLastName}`.toUpperCase() }, { merge: true });
    const id = uuidv4();
    const appData = { ...a, patientId: curp, id, date: Timestamp.fromDate(parseISO(a.date)), createdAt: Timestamp.now() };
    batch.set(doc(adminDb, 'labAppointments', id), appData);
    await batch.commit(); return { success: true, data: { ...appData, id } };
}
export async function saveNewXRayAppointment(a: any, p: any) {
    const curp = String(p.curp).toUpperCase().trim();
    const batch = writeBatch(adminDb);
    batch.set(doc(adminDb, 'patients', curp), { ...p, curp, nombreCompleto: `${p.name} ${p.paternalLastName} ${p.maternalLastName}`.toUpperCase() }, { merge: true });
    const id = uuidv4();
    const appData = { ...a, patientId: curp, id, date: Timestamp.fromDate(parseISO(a.date)), createdAt: Timestamp.now() };
    batch.set(doc(adminDb, 'xrayAppointments', id), appData);
    await batch.commit(); return { success: true, data: { ...appData, id } };
}
export async function saveNewUltrasoundAppointment(a: any, p: any) {
    const curp = String(p.curp).toUpperCase().trim();
    const batch = writeBatch(adminDb);
    batch.set(doc(adminDb, 'patients', curp), { ...p, curp, nombreCompleto: `${p.name} ${p.paternalLastName} ${p.maternalLastName}`.toUpperCase() }, { merge: true });
    const id = uuidv4();
    const appData = { ...a, patientId: curp, id, date: Timestamp.fromDate(parseISO(a.date)), createdAt: Timestamp.now() };
    batch.set(doc(adminDb, 'ultrasoundAppointments', id), appData);
    await batch.commit(); return { success: true, data: { ...appData, id } };
}
export async function saveNewVaccineAppointment(a: any, p: any) {
    const curp = String(p.curp).toUpperCase().trim();
    const batch = writeBatch(adminDb);
    batch.set(doc(adminDb, 'patients', curp), { ...p, curp, nombreCompleto: `${p.name} ${p.paternalLastName} ${p.maternalLastName}`.toUpperCase() }, { merge: true });
    const id = uuidv4();
    const appData = { ...a, patientId: curp, id, date: Timestamp.fromDate(parseISO(a.date)), createdAt: Timestamp.now() };
    batch.set(doc(adminDb, 'vaccineAppointments', id), appData);
    await batch.commit(); return { success: true, data: { ...appData, id } };
}

export async function updateAppointmentStatus(id: string, s: AppointmentStatus, t: string) {
    const colls: any = { medical: 'appointments', lab: 'labAppointments', xray: 'xrayAppointments', ultrasound: 'ultrasoundAppointments', vaccine: 'vaccineAppointments' };
    await updateDoc(doc(adminDb, colls[t] || 'appointments', id), { status: s }); return { success: true };
}
export async function rescheduleAppointment(id: string, date: string, type: string, time: string) {
    const colls: any = { medical: 'appointments', lab: 'labAppointments', xray: 'xrayAppointments', ultrasound: 'ultrasoundAppointments', vaccine: 'vaccineAppointments' };
    await updateDoc(doc(adminDb, colls[type] || 'appointments', id), { date: Timestamp.fromDate(parseISO(date)), time }); return { success: true };
}
export async function cloneAppointment(id: string, date: string, type: string, time: string) {
    const colls: any = { medical: 'appointments', lab: 'labAppointments', xray: 'xrayAppointments', ultrasound: 'ultrasoundAppointments', vaccine: 'vaccineAppointments' };
    const coll = colls[type] || 'appointments';
    const snap = await getDoc(doc(adminDb, coll, id));
    if (!snap.exists()) return { success: false };
    const newId = uuidv4();
    await setDoc(doc(adminDb, coll, newId), { ...snap.data(), id: newId, appointmentNumber: `${snap.data().appointmentNumber}-CL`, date: Timestamp.fromDate(parseISO(date)), time, createdAt: Timestamp.now(), status: 'Agendada' });
    return { success: true, message: 'Nueva cita asignada correctamente' };
}

// --- CATALOGOS ---
export async function getClinicsData() { const snap = await getDocs(collection(adminDb, 'clinics')); return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id }))); }
export async function updateClinics(c: Clinic[]) { const b = writeBatch(adminDb); c.forEach(i => b.set(doc(adminDb, 'clinics', i.id), i)); await b.commit(); return { success: true }; }
export async function deleteClinic(id: string) { await deleteDoc(doc(adminDb, 'clinics', id)); return { success: true }; }
export async function bulkInsertDoctors(items: any[]) {
    const b = writeBatch(adminDb);
    items.forEach(i => {
        const id = uuidv4();
        b.set(doc(adminDb, 'clinics', id), { 
            id, doctorName: String(i.Médico || i.Nombre || '').toUpperCase(), professionalLicense: String(i.Cédula || ''),
            name: String(i.Unidad || 'NÚCLEO').toUpperCase(), serviceTypeId: String(i.Categoría || 'CONSULTA EXTERNA').toUpperCase(),
            dailySlots: 10, startTime: '08:00', endTime: '13:00', bookingMode: BookingMode.Time, consultationDuration: 30, password: '123'
        });
    });
    await b.commit(); return { success: true, processedCount: items.length };
}
export async function getColoniasData() { const snap = await getDocs(collection(adminDb, 'colonias')); return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id }))); }
export async function updateColonias(items: Colonia[]) { const b = writeBatch(adminDb); items.forEach(i => b.set(doc(adminDb, 'colonias', i.id), i)); await b.commit(); return { success: true }; }
export async function getServiceTypesData() { const snap = await getDocs(collection(adminDb, 'serviceTypes')); return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id }))); }
export async function updateServiceTypes(items: ServiceType[]) { const b = writeBatch(adminDb); items.forEach(i => b.set(doc(adminDb, 'serviceTypes', i.id), i)); await b.commit(); return { success: true }; }
export async function getSpecialtiesData() { const snap = await getDocs(collection(adminDb, 'specialties')); return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id }))); }
export async function updateSpecialties(items: Specialty[]) { const b = writeBatch(adminDb); items.forEach(i => b.set(doc(adminDb, 'specialties', i.id), i)); await b.commit(); return { success: true }; }
export async function getHolidaysData() { const snap = await getDocs(collection(adminDb, 'holidays')); return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id }))); }
export async function updateHolidays(items: Holiday[]) { const b = writeBatch(adminDb); items.forEach(i => b.set(doc(adminDb, 'holidays', i.date), i)); await b.commit(); return { success: true }; }
export async function getSpecialActionDaysData() { const snap = await getDocs(collection(adminDb, 'specialActionDays')); return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id }))); }
export async function updateSpecialActionDays(items: SpecialActionDay[]) { const b = writeBatch(adminDb); items.forEach(i => b.set(doc(adminDb, 'specialActionDays', i.date + '_' + i.clinicType), i)); await b.commit(); return { success: true }; }
export async function getDepartmentsData() { const snap = await getDocs(collection(adminDb, 'departments')); return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id }))); }
export async function updateDepartments(items: Department[]) { const b = writeBatch(adminDb); items.forEach(i => b.set(doc(adminDb, 'departments', i.id), i)); await b.commit(); return { success: true }; }

// --- FARMACIA ---
export async function getMedications() { const s = await getDocs(collection(adminDb, 'medications')); return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id }))); }
export async function bulkInsertMedications(items: any[], source: string) {
    const b = writeBatch(adminDb);
    items.forEach(i => {
        const id = uuidv4();
        b.set(doc(adminDb, 'medications', id), { 
            id, claveCuadroBasico: String(i.Clave || i.claveCuadroBasico || '').toUpperCase(),
            descripcion: String(i.Denominación || i.descripcion || '').toUpperCase(),
            existencia: parseInt(i.Existencia || i.existencia) || 0, lote: String(i.Lote || i.lote || 'N/A').toUpperCase(),
            fechaCaducidad: String(i.Caducidad || i.fechaCaducidad || 'S/F'), fuenteEtiqueta: source 
        });
    });
    await b.commit(); return { success: true, processedCount: items.length };
}
export async function deleteMedicationsBySource(s: string) { const snap = await getDocs(query(collection(adminDb, 'medications'), where('fuenteEtiqueta', '==', s))); const b = writeBatch(adminDb); snap.forEach(d => b.delete(d.ref)); await b.commit(); return { success: true, deletedCount: snap.size }; }
export async function deleteAllMedications() { const snap = await getDocs(collection(adminDb, 'medications')); const b = writeBatch(adminDb); snap.forEach(d => b.delete(d.ref)); await b.commit(); return { success: true }; }
export async function getSupplies() { return getMedications(); }
export async function bulkInsertSupplies(items: any[]) { return bulkInsertMedications(items, 'ALMACEN'); }
export async function deleteAllSupplies() { return deleteAllMedications(); }
export async function createPharmacyVoucher(v: any) {
    const id = uuidv4();
    const folio = `VAL-${uuidv4().split('-')[0].toUpperCase()}`;
    const b = writeBatch(adminDb);
    b.set(doc(adminDb, 'pharmacyVouchers', id), { ...v, id, folio, createdAt: Timestamp.now() });
    v.items.forEach((i: any) => b.update(doc(adminDb, 'medications', i.medicationId), { existencia: increment(-i.quantity) }));
    await b.commit(); return { success: true, folio };
}
export async function getPharmacyVouchers() { const s = await getDocs(query(collection(adminDb, 'pharmacyVouchers'), orderBy('createdAt', 'desc'), limit(100))); return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id }))); }

// --- RECETAS Y CONSULTAS ---
export async function createPrescription(p: any) {
    const id = uuidv4();
    const folio = `REC-${uuidv4().split('-')[0].toUpperCase()}`;
    const data = { ...p, id, folio, status: 'pendiente', expiresAt: Timestamp.fromDate(addDays(new Date(), 1)), createdAt: Timestamp.now() };
    await setDoc(doc(adminDb, 'prescriptions', id), data); return { success: true, folio, prescription: data };
}
export async function updatePrescription(id: string, data: any) { await updateDoc(doc(adminDb, 'prescriptions', id), data); return { success: true }; }
export async function dispensePrescription(id: string, items: any[]) {
    const b = writeBatch(adminDb);
    b.update(doc(adminDb, 'prescriptions', id), { status: 'surtida', dispensedAt: Timestamp.now() });
    items.forEach(i => b.update(doc(adminDb, 'medications', i.medicationId), { existencia: increment(-i.quantity) }));
    await b.commit(); return { success: true };
}
export async function getPendingPrescriptions(f?: any) {
    let q = query(collection(adminDb, 'prescriptions'), where('status', '==', 'pendiente'), limit(100));
    if (f?.folio) q = query(collection(adminDb, 'prescriptions'), where('folio', '==', f.folio.toUpperCase().trim()));
    const s = await getDocs(q);
    let results = s.docs.map(d => ({ ...d.data(), id: d.id } as Prescription));
    if (f?.clinicId) results = results.filter(r => r.clinicId === f.clinicId);
    return serializeData(results);
}
export async function getPrescriptionHistory(o?: any) { const s = await getDocs(query(collection(adminDb, 'prescriptions'), where('status', '==', 'surtida'), orderBy('dispensedAt', 'desc'), limit(200))); return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id }))); }
export async function deletePrescription(id: string) { await deleteDoc(doc(adminDb, 'prescriptions', id)); return { success: true }; }

export async function saveMedicalConsultation(c: any) {
    const id = c.id || uuidv4();
    await setDoc(doc(adminDb, 'medicalConsultations', id), { ...c, id, createdAt: Timestamp.now() }, { merge: true });
    if (c.isFinal) await updateDoc(doc(adminDb, 'appointments', c.appointmentId), { status: 'Atendido' });
    return { success: true, id };
}
export async function getConsultationByAppointmentId(aid: string) { const s = await getDocs(query(collection(adminDb, 'medicalConsultations'), where('appointmentId', '==', aid), limit(1))); return s.empty ? null : serializeData({ ...s.docs[0].data(), id: s.docs[0].id }); }
export async function deleteMedicalConsultation(id: string) { await deleteDoc(doc(adminDb, 'medicalConsultations', id)); return { success: true }; }

export async function getAttendedPatientsForClinic(cid: string) {
    const s = await getDocs(query(collection(adminDb, 'medicalConsultations'), where('clinicId', '==', cid), limit(1000)));
    const ids = Array.from(new Set(s.docs.map(d => d.data().patientId)));
    if (ids.length === 0) return [];
    const pSnap = await getDocs(query(collection(adminDb, 'patients'), where(documentId(), 'in', ids.slice(0, 30))));
    return serializeData(pSnap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getConsultationsByPatientId(pid: string) { const s = await getDocs(query(collection(adminDb, 'medicalConsultations'), where('patientId', '==', pid), orderBy('createdAt', 'desc'), limit(100))); return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id }))); }
export async function getPrescriptionsByPatientId(pid: string) { const s = await getDocs(query(collection(adminDb, 'prescriptions'), where('patientId', '==', pid), orderBy('createdAt', 'desc'), limit(100))); return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id }))); }
export async function getPatientPrescriptionsCountTodayAction(pid: string) {
    const start = Timestamp.fromDate(startOfDay(new Date()));
    const q = query(collection(adminDb, 'prescriptions'), where('patientId', '==', pid));
    const snap = await getDocs(q);
    return snap.docs.filter(d => d.data().createdAt && d.data().createdAt.seconds >= start.seconds).length;
}

// --- OTROS MÓDULOS SETTINGS ---
export async function getLabSettings() { const s = await getDoc(doc(adminDb, 'settings', 'labSettings')); return s.exists() ? serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 0, weekendBookingEnabled: false, password: '123' }; }
export async function updateLabSettings(s: any) { await setDoc(doc(adminDb, 'settings', 'labSettings'), s); return { success: true }; }
export async function getLabStudies() { const s = await getDocs(collection(adminDb, 'labStudies')); return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id }))); }
export async function updateLabStudies(items: any[]) { const b = writeBatch(adminDb); items.forEach(i => b.set(doc(adminDb, 'labStudies', i.id), i)); await b.commit(); return { success: true }; }
export async function getXRaySettings() { const s = await getDoc(doc(adminDb, 'settings', 'xraySettings')); return s.exists() ? serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 0, startTime: '08:00', endTime: '13:00', weekendBookingEnabled: false }; }
export async function updateXRaySettings(s: any) { await setDoc(doc(adminDb, 'settings', 'xraySettings'), s); return { success: true }; }
export async function getXRayStudies() { const s = await getDocs(collection(adminDb, 'xrayStudies')); return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id }))); }
export async function updateXRayStudies(items: any[]) { const b = writeBatch(adminDb); items.forEach(i => b.set(doc(adminDb, 'xrayStudies', i.id), i)); await b.commit(); return { success: true }; }
export async function getUltrasoundSettings() { const s = await getDoc(doc(adminDb, 'settings', 'ultrasoundSettings')); return s.exists() ? serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 0, startTime: '08:00', endTime: '13:00', weekendBookingEnabled: false }; }
export async function updateUltrasoundSettings(s: any) { await setDoc(doc(adminDb, 'settings', 'ultrasoundSettings'), s); return { success: true }; }
export async function getUltrasoundStudies() { const s = await getDocs(collection(adminDb, 'ultrasoundStudies')); return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id }))); }
export async function updateUltrasoundStudies(items: any[]) { const b = writeBatch(adminDb); items.forEach(i => b.set(doc(adminDb, 'ultrasoundStudies', i.id), i)); await b.commit(); return { success: true }; }
export async function getVaccineSettings() { const s = await getDoc(doc(adminDb, 'settings', 'vaccineSettings')); return s.exists() ? serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 0, startTime: '08:00', endTime: '13:00', weekendBookingEnabled: false }; }
export async function updateVaccineSettings(s: any) { await setDoc(doc(adminDb, 'settings', 'vaccineSettings'), s); return { success: true }; }
export async function getVaccines() { const s = await getDocs(collection(adminDb, 'vaccines')); return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id }))); }
export async function updateVaccines(items: any[]) { const b = writeBatch(adminDb); items.forEach(i => b.set(doc(adminDb, 'vaccines', i.id), i)); await b.commit(); return { success: true }; }

// --- MANTENIMIENTO ---
export async function getBIData() {
  const [apps, lab, xr, us, vac, clinics, colonias] = await Promise.all([
    getAppointmentsData(), getLabAppointmentsData(), getXRayAppointmentsData(), getUltrasoundAppointmentsData(), getVaccineAppointmentsData(), getClinicsData(), getColoniasData(),
  ]);
  return { appointments: apps, labAppointments: lab, xRayAppointments: xr, ultrasoundAppointments: us, vaccineAppointments: vac, clinics, colonias };
}
export async function getAppointmentCountOnDate(clinicId: string, d: string) {
    const start = Timestamp.fromDate(startOfDay(parseISO(d)));
    const end = Timestamp.fromDate(endOfDay(parseISO(d)));
    const q = query(collection(adminDb, 'appointments'), where('date', '>=', start), where('date', '<=', end));
    const snap = await getDocs(q);
    return snap.docs.filter(d => d.data().clinicId === clinicId).length;
}
export async function applyStatusUpdateChunk(exps: string[], s: any) {
    const q = query(collection(adminDb, 'patients'), where('expediente', 'in', exps));
    const snap = await getDocs(q);
    const b = writeBatch(adminDb);
    snap.forEach(d => b.update(d.ref, { status: s }));
    await b.commit(); return { success: true, count: snap.size };
}
export async function scanDuplicates(criteria: 'expediente' | 'curp' | 'name') {
    const snap = await getDocs(collection(adminDb, 'patients'));
    const all = snap.docs.map(d => ({ ...d.data(), id: d.id } as Patient));
    const map = new Map<string, Patient[]>();
    all.forEach(p => {
        let key = criteria === 'expediente' ? p.expediente : criteria === 'curp' ? p.curp : `${p.name} ${p.paternalLastName} ${p.maternalLastName}`.toUpperCase();
        if (key && key.length > 2) { if (!map.has(key)) map.set(key, []); map.get(key)!.push(p); }
    });
    return serializeData(Array.from(map.values()).filter(g => g.length > 1));
}
export async function normalizeExpedientesAction() {
    const snap = await getDocs(collection(adminDb, 'patients'));
    const b = writeBatch(adminDb);
    let count = 0;
    snap.forEach(d => {
        const exp = String(d.data().expediente || '');
        if (exp && exp.length > 0 && exp.length < 5) { b.update(d.ref, { expediente: exp.padStart(5, '0') }); count++; }
    });
    await b.commit(); return { success: true, count };
}
export async function rebuildNombreCompletoAction() {
    const snap = await getDocs(collection(adminDb, 'patients'));
    const b = writeBatch(adminDb);
    let count = 0;
    snap.forEach(d => {
        const data = d.data();
        b.update(d.ref, { nombreCompleto: `${data.name} ${data.paternalLastName} ${data.maternalLastName}`.toUpperCase().trim() });
        count++;
    });
    await b.commit(); return { success: true, count };
}
export async function cleanupOldRecords() {
    const limit = Timestamp.fromDate(subMonths(new Date(), 4));
    const colls = ['appointments', 'labAppointments', 'xrayAppointments', 'ultrasoundAppointments', 'vaccineAppointments', 'activityLog'];
    let total = 0;
    for (const c of colls) {
        const snap = await getDocs(collection(adminDb, c));
        const b = writeBatch(adminDb);
        snap.forEach(d => { if (d.data().date && d.data().date < limit) { b.delete(d.ref); total++; } });
        await b.commit();
    }
    return { success: true, deletedCount: total };
}
export async function downloadBackupAction() {
    const colls = ['patients', 'appointments', 'labAppointments', 'xrayAppointments', 'ultrasoundAppointments', 'vaccineAppointments', 'clinics'];
    const res: any = {};
    for (const c of colls) { const s = await getDocs(collection(adminDb, c)); res[c] = s.docs.map(d => ({ ...d.data(), id: d.id })); }
    return { success: true, data: serializeData(res) };
}
export async function getAvailableSlotsForDate(cid: string, d: string) {
    const start = Timestamp.fromDate(startOfDay(parseISO(d)));
    const end = Timestamp.fromDate(endOfDay(parseISO(d)));
    const q = query(collection(adminDb, 'appointments'), where('date', '>=', start), where('date', '<=', end));
    const snap = await getDocs(q);
    const booked = snap.docs.map(d => d.data()).filter((a: any) => a.clinicId === cid);
    const cSnap = await getDoc(doc(adminDb, 'clinics', cid));
    if (!cSnap.exists()) return { timeSlots: [], tokens: [] };
    const c = cSnap.data() as Clinic;
    if (c.bookingMode === BookingMode.Time) {
        const slots: string[] = [];
        let curr = new Date(`1970-01-01T${c.startTime || '08:00'}:00`);
        const endH = new Date(`1970-01-01T${c.endTime || '14:00'}:00`);
        while (curr < endH) {
            const t = curr.toTimeString().substring(0, 5);
            if (!booked.some((a: any) => a.time === t)) slots.push(t);
            curr = new Date(curr.getTime() + (c.consultationDuration || 30) * 60000);
        }
        return { timeSlots: slots };
    } else {
        const total = (c.dailySlots || 15) + (c.waitlistSlots || 0);
        const free: number[] = [];
        for (let i = 1; i <= total; i++) { if (!booked.some((a: any) => a.time === `Ficha ${i}`)) free.push(i); }
        return { tokens: free };
    }
}
export async function searchCie10(t: string): Promise<Cie10Record[]> {
    const q = query(collection(adminDb, 'cie10'), where('nombre', '>=', t.toUpperCase()), where('nombre', '<=', t.toUpperCase() + '\uf8ff'), limit(50));
    const s = await getDocs(q); return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id })));
}
export async function bulkInsertCie10Glossary(items: any[]) { const b = writeBatch(adminDb); items.forEach(i => b.set(doc(adminDb, 'cie10_glossary', uuidv4()), { ...i })); await b.commit(); return { success: true, processedCount: items.length }; }
export async function bulkInsertCie10Catalog(items: any[]) { const b = writeBatch(adminDb); items.forEach(i => b.set(doc(adminDb, 'cie10', uuidv4()), { ...i, nombre: String(i.nombre || '').toUpperCase() })); await b.commit(); return { success: true, processedCount: items.length }; }
export async function deleteAllCie10Glossary() { const s = await getDocs(collection(adminDb, 'cie10_glossary')); const b = writeBatch(adminDb); s.forEach(d => b.delete(d.ref)); await b.commit(); return { success: true }; }
export async function deleteAllCie10Catalog() { const s = await getDocs(collection(adminDb, 'cie10')); const b = writeBatch(adminDb); s.forEach(d => b.delete(d.ref)); await b.commit(); return { success: true }; }
export async function getAnnouncementsData(): Promise<string[]> { const s = await getDoc(doc(adminDb, 'settings', 'announcements')); return s.exists() ? s.data().messages || [] : []; }
export async function updateAnnouncementsData(messages: string[]) { await setDoc(doc(adminDb, 'settings', 'announcements'), { messages }); return { success: true }; }
