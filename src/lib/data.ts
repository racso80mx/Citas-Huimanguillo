
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
  Department
} from './definitions';
import { PatientStatus, BookingMode } from './definitions';
import { v4 as uuidv4 } from 'uuid';
import { startOfDay, endOfDay, parseISO, format, isValid } from 'date-fns';

export { 
    adminDb, collection, doc, getDoc, getDocs, writeBatch, 
    setDoc, updateDoc, deleteDoc, addDoc, query, where, 
    limit, orderBy, increment, documentId, Timestamp, getCountFromServer
};

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

function normalizeString(s: string): string {
    return String(s || '')
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim()
        .replace(/\s+/g, '');
}

function generateNombreCompleto(p: any) {
    const n = (p.name || '').trim();
    const ap = (p.paternalLastName || '').trim();
    const am = (p.maternalLastName || '').trim();
    return `${n} ${ap} ${am}`.replace(/\s+/g, ' ').trim().toUpperCase();
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
    return appointments.map(app => ({
        ...app,
        patient: serializeData(patientsMap[app.patientId] || app.patient || {}),
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

// --- MÓDULOS ---
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
export async function updateModuleSettings(s: ModuleSettings) { await setDoc(doc(adminDb, 'settings', 'moduleSettings'), s, { merge: true }); return { success: true }; }

// --- PACIENTES ---
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

// --- CITAS ---
export async function getAppointmentsData() {
    const snap = await getDocs(query(collection(adminDb, 'appointments'), limit(10000)));
    return hydrateAppointments(snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })));
}
export async function getLabAppointmentsData() {
    const snap = await getDocs(query(collection(adminDb, 'labAppointments'), limit(10000)));
    return hydrateAppointments(snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })));
}
export async function getXRayAppointmentsData() {
    const snap = await getDocs(query(collection(adminDb, 'xrayAppointments'), limit(10000)));
    return hydrateAppointments(snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })));
}
export async function getUltrasoundAppointmentsData() {
    const snap = await getDocs(query(collection(adminDb, 'ultrasoundAppointments'), limit(10000)));
    return hydrateAppointments(snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })));
}
export async function getVaccineAppointmentsData() {
    const snap = await getDocs(query(collection(adminDb, 'vaccineAppointments'), limit(10000)));
    return hydrateAppointments(snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })));
}
export async function deleteAppointment(id: string) { await deleteDoc(doc(adminDb, 'appointments', id)); return { success: true }; }
export async function deleteLabAppointment(id: string) { await deleteDoc(doc(adminDb, 'labAppointments', id)); return { success: true }; }
export async function deleteXRayAppointment(id: string) { await deleteDoc(doc(adminDb, 'xrayAppointments', id)); return { success: true }; }
export async function deleteUltrasoundAppointment(id: string) { await deleteDoc(doc(adminDb, 'ultrasoundAppointments', id)); return { success: true }; }
export async function deleteVaccineAppointment(id: string) { await deleteDoc(doc(adminDb, 'vaccineAppointments', id)); return { success: true }; }

// --- REPROGRAMACIÓN ---
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

export async function getAvailableSlotsForDate(clinicId: string, dateIso: string) {
    const cDoc = await getDoc(doc(adminDb, 'clinics', clinicId)); if (!cDoc.exists()) return {};
    const clinic = serializeData(cDoc.data()) as Clinic; 
    const targetDay = format(parseISO(dateIso), 'yyyy-MM-dd');
    const snap = await getDocs(query(collection(adminDb, 'appointments'), where('clinicId', '==', clinicId)));
    const taken = snap.docs.map(d => serializeData(d.data())).filter(a => format(parseISO(a.date), 'yyyy-MM-dd') === targetDay).map(a => a.time);
    
    if (clinic.bookingMode === BookingMode.Token) {
        const tot = (clinic.dailySlots || 15) + (clinic.waitlistSlots || 0);
        return { tokens: Array.from({ length: tot }, (_, i) => i + 1).filter(t => !taken.includes(`Ficha ${t}`)) };
    } else {
        const slots: string[] = []; const sH = clinic.startTime || '08:00'; const eH = clinic.endTime || '13:00';
        try { 
            let curr = new Date(`1970-01-01T${sH}:00`); const stop = new Date(`1970-01-01T${eH}:00`);
            while (curr < stop) { 
                const t = curr.toTimeString().substring(0, 5); 
                if (t !== clinic.breakTime) slots.push(t); 
                curr = new Date(curr.getTime() + (clinic.consultationDuration || 30) * 60000); 
            }
        } catch (e) {}
        return { timeSlots: slots.filter(s => !taken.includes(s)) };
    }
}
export async function getAppointmentCountOnDate(clinicId: string, dateStr: string) {
    const snap = await getDocs(query(collection(adminDb, 'appointments'), where('clinicId', '==', clinicId)));
    return snap.docs.filter(d => format(parseISO(serializeData(d.data()).date), 'yyyy-MM-dd') === dateStr).length;
}

// --- CONSULTAS Y RECETAS ---
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
export async function createPrescription(p: any) {
    const id = uuidv4(); const folio = `REC-${uuidv4().split('-')[0].toUpperCase()}`;
    const exp = new Date(); exp.setHours(exp.getHours() + 24);
    await setDoc(doc(adminDb, 'prescriptions', id), { ...p, id, folio, status: 'pendiente', createdAt: new Date().toISOString(), expiresAt: exp.toISOString() });
    return { success: true, folio, prescription: { ...p, id, folio, status: 'pendiente' } };
}
export async function updatePrescription(id: string, data: any) {
    const docRef = doc(adminDb, 'prescriptions', id);
    await updateDoc(docRef, { ...data, updatedAt: new Date().toISOString() });
    return { success: true };
}
export async function deletePrescription(id: string) {
    const docRef = doc(adminDb, 'prescriptions', id);
    await deleteDoc(docRef);
    return { success: true };
}
export async function dispensePrescription(id: string, items: any[]) {
    const b = writeBatch(adminDb); items.forEach(i => b.update(doc(adminDb, 'medications', i.medicationId), { existencia: increment(-i.quantity) }));
    b.update(doc(adminDb, 'prescriptions', id), { status: 'surtida', dispensedAt: new Date().toISOString() });
    await b.commit(); return { success: true };
}

// --- FARMACIA ---
export async function getMedications() {
    const snap = await getDocs(query(collection(adminDb, 'medications'), limit(10000)));
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}
export async function bulkInsertMedications(items: any[], source: string) {
    const findFld = (row: any, names: string[]) => { const search = names.map(normalizeString); const kFound = Object.keys(row).find(k => search.includes(normalizeString(k))); return kFound ? row[kFound] : null; };
    const colName = source === 'EXTERNO' ? 'supplies' : 'medications';
    for (let i = 0; i < items.length; i += 400) {
        const batch = writeBatch(adminDb);
        items.slice(i, i + 400).forEach(raw => {
            const rawFecha = findFld(raw, ['FECHA CADUCIDAD', 'CADUCIDAD', 'VENCIMIENTO', 'VENCE']);
            let fCad = 'SIN FECHA'; if (rawFecha instanceof Date) fCad = rawFecha.toLocaleDateString('es-MX');
            else if (typeof rawFecha === 'number' && rawFecha > 40000) fCad = new Date((rawFecha - 25569) * 86400 * 1000).toLocaleDateString('es-MX');
            else fCad = String(rawFecha || 'SIN FECHA').trim();
            const rawLote = String(findFld(raw, ['LOTE', 'LOTES']) || 'S/L').toUpperCase().trim();
            const mapped: any = {
                claveCuadroBasico: String(findFld(raw, ['CLAVE DE CUADRO BASICO', 'CLAVE', 'CODIGO']) || '').trim(),
                descripcion: String(findFld(raw, ['DESCRIPCION', 'DENOMINACION GENERICA', 'NOMBRE']) || '').toUpperCase().trim(),
                existencia: Number(findFld(raw, ['EXISTENCIA', 'CANTIDAD', 'STOCK']) || 0),
                lote: rawLote, fechaCaducidad: fCad, fuenteEtiqueta: source, updatedAt: new Date().toISOString()
            };
            if (!mapped.descripcion) return;
            const id = `${mapped.claveCuadroBasico || uuidv4().split('-')[0]}_${source}_${rawLote.replace(/\//g, '-')}`;
            batch.set(doc(adminDb, colName, id), { ...mapped, id }, { merge: true });
        });
        await batch.commit();
    }
    return { success: true };
}
export async function deleteMedicationsBySource(source: string) {
    const colName = source === 'EXTERNO' ? 'supplies' : 'medications';
    const snap = await getDocs(query(collection(adminDb, colName), where('fuenteEtiqueta', '==', source)));
    const batch = writeBatch(adminDb); snap.forEach(d => batch.delete(d.ref));
    await batch.commit(); return { success: true, deletedCount: snap.size };
}

// --- MANTENIMIENTO ---
export async function cleanupOldRecords() {
    const limitDate = new Date(); limitDate.setDate(limitDate.getDate() - 30); const iso = limitDate.toISOString();
    const colls = ['appointments', 'labAppointments', 'xrayAppointments', 'ultrasoundAppointments', 'vaccineAppointments'];
    for (const c of colls) { const s = await getDocs(collection(adminDb, c)); const b = writeBatch(adminDb); s.docs.filter(d => d.data().date < iso).forEach(d => b.delete(d.ref)); await b.commit(); }
    return { success: true };
}
export async function downloadBackupAction() {
    const colls = ['patients', 'appointments', 'clinics', 'medications', 'labAppointments', 'xrayAppointments', 'ultrasoundAppointments', 'vaccineAppointments'];
    const res: any = {}; for (const c of colls) { const s = await getDocs(query(collection(adminDb, c), limit(10000))); res[c] = s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
    return { success: true, data: res };
}

// --- CATALOGOS ---
export async function getClinicsData() { return (await getDocs(collection(adminDb, 'clinics'))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }
export async function getHolidaysData() { return (await getDocs(collection(adminDb, 'holidays'))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }
export async function getColoniasData() { return (await getDocs(collection(adminDb, 'colonias'))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }
export async function getServiceTypesData() { return (await getDocs(collection(adminDb, 'serviceTypes'))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }
export async function getSpecialtiesData() { return (await getDocs(collection(adminDb, 'specialties'))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }
export async function getDepartmentsData() { return (await getDocs(collection(adminDb, 'departments'))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }

export async function getAttendedPatientsForClinic(clinicId: string) {
    const snap = await getDocs(query(collection(adminDb, 'medicalConsultations'), where('clinicId', '==', clinicId), limit(1000)));
    const patientIds = Array.from(new Set(snap.docs.map(d => d.data().patientId)));
    const patients: any[] = [];
    if (patientIds.length > 0) {
        const CHUNK_SIZE = 30;
        for (let i = 0; i < patientIds.length; i += CHUNK_SIZE) {
            const chunk = patientIds.slice(i, i + CHUNK_SIZE);
            const pSnap = await getDocs(query(collection(adminDb, 'patients'), where(documentId(), 'in', chunk)));
            pSnap.forEach(d => patients.push({ ...d.data(), id: d.id }));
        }
    }
    return serializeData(patients);
}

export async function getPharmacyVouchers() {
    const snap = await getDocs(query(collection(adminDb, 'pharmacyVouchers'), orderBy('createdAt', 'desc'), limit(100)));
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function createPharmacyVoucher(v: any) {
    const id = uuidv4();
    const folio = `VALE-${uuidv4().split('-')[0].toUpperCase()}`;
    const batch = writeBatch(adminDb);
    for (const item of v.items) batch.update(doc(adminDb, 'medications', item.medicationId), { existencia: increment(-item.quantity) });
    batch.set(doc(adminDb, 'pharmacyVouchers', id), { ...v, id, folio, createdAt: new Date().toISOString() });
    await batch.commit(); return { success: true, folio };
}

export async function getPendingPrescriptions(filters?: { folio?: string, clinicId?: string }) {
    let q = query(collection(adminDb, 'prescriptions'), where('status', '==', 'pendiente'));
    if (filters?.folio) q = query(q, where('folio', '==', filters.folio.toUpperCase().trim()));
    if (filters?.clinicId) q = query(q, where('clinicId', '==', filters.clinicId));
    const snap = await getDocs(q);
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function saveNewAppointment(appointment: any, patient: any, isDouble: boolean, colonia?: string) {
    const b = writeBatch(adminDb); const pid = patient.curp.toUpperCase().trim();
    b.set(doc(adminDb, 'patients', pid), { ...patient, id: pid, nombreCompleto: generateNombreCompleto(patient) }, { merge: true });
    const appNum = `APP-${uuidv4().split('-')[0].toUpperCase()}`;
    const data = { ...appointment, patientId: pid, appointmentNumber: appNum, coloniaName: colonia, createdAt: new Date().toISOString() };
    b.set(doc(adminDb, 'appointments', uuidv4()), data);
    if (isDouble) {
        let nextTime = appointment.time; try { const d = new Date(`1970-01-01T${appointment.time}:00`); d.setMinutes(d.getMinutes() + 30); nextTime = d.toTimeString().substring(0, 5); } catch(e){}
        b.set(doc(adminDb, 'appointments', uuidv4()), { ...data, time: nextTime, appointmentNumber: `${appNum}-2` });
    }
    await b.commit(); return { success: true, data: { appointment: { ...data, id: 'tmp' }, clinic: {} } };
}

export async function saveNewLabAppointment(a: any, p: any) {
    const b = writeBatch(adminDb); const pid = p.curp.toUpperCase().trim();
    b.set(doc(adminDb, 'patients', pid), { ...p, id: pid, nombreCompleto: generateNombreCompleto(p) }, { merge: true });
    const data = { ...a, patientId: pid, createdAt: new Date().toISOString() };
    b.set(doc(adminDb, 'labAppointments', uuidv4()), data);
    await b.commit(); return { success: true, data: { ...data, patient: p } };
}
export async function saveNewXRayAppointment(a: any, p: any) {
    const b = writeBatch(adminDb); const pid = p.curp.toUpperCase().trim();
    b.set(doc(adminDb, 'patients', pid), { ...p, id: pid, nombreCompleto: generateNombreCompleto(p) }, { merge: true });
    const data = { ...a, patientId: pid, createdAt: new Date().toISOString() };
    b.set(doc(adminDb, 'xrayAppointments', uuidv4()), data);
    await b.commit(); return { success: true, data: { appointment: { ...data, patient: p }, study: { name: a.studyName, indications: '' } } };
}
export async function saveNewUltrasoundAppointment(a: any, p: any) {
    const b = writeBatch(adminDb); const pid = p.curp.toUpperCase().trim();
    b.set(doc(adminDb, 'patients', pid), { ...p, id: pid, nombreCompleto: generateNombreCompleto(p) }, { merge: true });
    const data = { ...a, patientId: pid, createdAt: new Date().toISOString() };
    b.set(doc(adminDb, 'ultrasoundAppointments', uuidv4()), data);
    await b.commit(); return { success: true, data: { appointment: { ...data, patient: p }, study: { name: a.studyName, indications: '' } } };
}
export async function saveNewVaccineAppointment(a: any, p: any) {
    const b = writeBatch(adminDb); const pid = p.curp.toUpperCase().trim();
    b.set(doc(adminDb, 'patients', pid), { ...p, id: pid, nombreCompleto: generateNombreCompleto(p) }, { merge: true });
    const data = { ...a, patientId: pid, createdAt: new Date().toISOString() };
    b.set(doc(adminDb, 'vaccineAppointments', uuidv4()), data);
    await b.commit(); return { success: true, data: { ...data, patient: p } };
}

export async function getPrescriptionHistory(filters: any) {
    let q = query(collection(adminDb, 'prescriptions'), where('status', '==', 'surtida'));
    if (filters?.startDate) q = query(q, where('dispensedAt', '>=', filters.startDate));
    const snap = await getDocs(q);
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getPatientPrescriptionsCountTodayAction(pid: string) {
    const snap = await getDocs(query(collection(adminDb, 'prescriptions'), where('patientId', '==', pid), where('createdAt', '>=', startOfDay(new Date()).toISOString())));
    return snap.size;
}

export async function searchCie10(term: string): Promise<Cie10Record[]> {
    const t = term.toUpperCase().trim();
    const snap = await getDocs(query(collection(adminDb, 'cie10Catalog'), where('nombre', '>=', t), where('nombre', '<=', t + '\uf8ff'), limit(20)));
    if (snap.empty) {
        const snapCode = await getDocs(query(collection(adminDb, 'cie10Catalog'), where('catalogKey', '>=', t), where('catalogKey', '<=', t + '\uf8ff'), limit(20)));
        return serializeData(snapCode.docs.map(d => ({ ...d.data(), id: d.id })));
    }
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function normalizeExpedientesAction() {
    const snap = await getDocs(collection(adminDb, 'patients'));
    const batch = writeBatch(adminDb);
    let count = 0;
    snap.forEach(d => {
        const exp = String(d.data().expediente || '');
        if (exp && exp.length < 5 && !exp.startsWith('0')) {
            batch.update(d.ref, { expediente: exp.padStart(5, '0') });
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
        batch.update(d.ref, { nombreCompleto: generateNombreCompleto(d.data()) });
        count++;
    });
    await batch.commit();
    return { success: true, count };
}

export async function scanDuplicates(criteria: 'expediente' | 'curp' | 'name') {
    const snap = await getDocs(collection(adminDb, 'patients'));
    const map = new Map<string, any[]>();
    snap.forEach(d => {
        const data = d.data();
        let key = '';
        if (criteria === 'expediente') key = String(data.expediente || '').trim();
        else if (criteria === 'curp') key = String(data.curp || '').trim().toUpperCase();
        else key = generateNombreCompleto(data);
        if (!key) return;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push({ ...data, id: d.id });
    });
    return Array.from(map.values()).filter(group => group.length > 1);
}

export async function verifyModulePassword(type: string, p: string) {
    const docName = type === 'superadmin' ? 'adminSettings' : type === 'medical' ? 'moduleSettings' : `${type}Settings`;
    const s = await getDoc(doc(adminDb, 'settings', docName));
    const success = s.exists() && (s.data().password === p || (type === 'medical' && s.data().citasMedicasPassword === p) || (type === 'archiveInquiry' && s.data().archivoConsultaPassword === p));
    return { success, message: !success ? 'Contraseña incorrecta.' : undefined };
}

export async function verifyClinicPassword(id: string, p: string) {
    const s = await getDoc(doc(adminDb, 'clinics', id));
    const success = s.exists() && s.data().password === p;
    return { success, message: !success ? 'Contraseña de consultorio incorrecta.' : undefined };
}
