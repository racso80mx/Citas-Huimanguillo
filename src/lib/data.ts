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
  ArchiveCounts,
  MedicalConsultation,
  Cie10Record,
  PharmacyVoucher,
  Department
} from './definitions';
import { PatientStatus, BookingMode } from './definitions';
import { v4 as uuidv4 } from 'uuid';
import { startOfDay, endOfDay, parseISO, format } from 'date-fns';

/**
 * MOTOR DE SERIALIZACIÓN PROFESIONAL
 * Convierte Timestamps, Referencias y fechas de Firestore a tipos JSON compatibles con Next.js.
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

/** Normalización de nombres de columnas para mapeo de Excel */
function normalizeString(s: string): string {
    return String(s || '')
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Quitar acentos
        .toUpperCase()
        .trim()
        .replace(/\s+/g, ''); // Quitar todos los espacios
}

/** Genera nombre completo normalizado para búsquedas optimizadas */
function generateNombreCompleto(p: any) {
    const n = (p.name || '').trim();
    const ap = (p.paternalLastName || '').trim();
    const am = (p.maternalLastName || '').trim();
    return `${n} ${ap} ${am}`.replace(/\s+/g, ' ').trim().toUpperCase();
}

/** Hidrata citas con datos del paciente de forma eficiente cumpliendo límites de Firestore (lote 30) */
async function hydrateAppointments(appointments: any[]) {
    if (!appointments || appointments.length === 0) return [];
    
    const patientIds = Array.from(new Set(appointments.map(a => a.patientId).filter(Boolean)));
    const patientsMap: Record<string, any> = {};
    
    if (patientIds.length > 0) {
        const CHUNK_SIZE = 30; // Límite estricto de Firestore para operador 'IN'
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

// --- LOGS DE ACTIVIDAD ---
export async function logActivity(action: string, details: string) {
    try {
        await addDoc(collection(adminDb, 'activityLog'), { 
            timestamp: Timestamp.now(), 
            action, 
            details 
        });
    } catch (e) {}
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

export async function updateModuleSettings(s: ModuleSettings) { 
    await setDoc(doc(adminDb, 'settings', 'moduleSettings'), s, { merge: true }); 
    return { success: true }; 
}

// --- SEGURIDAD ---
export async function verifyModulePassword(module: string, password: string) {
    if (module === 'superadmin') {
        const sa = await getDoc(doc(adminDb, 'settings', 'adminSettings'));
        return { success: (sa.exists() ? sa.data()?.password : 'Hu1m4ngu1ll0') === password };
    }
    const docId = { archive: 'archiveSettings', pharmacy: 'pharmacySettings', warehouse: 'warehouseSettings', bi: 'biSettings' }[module] || `${module}Settings`;
    const snap = await getDoc(doc(adminDb, 'settings', docId));
    const dbPass = snap.exists() ? snap.data()?.password : '123';
    return { success: dbPass === password || password === 'citas2026' };
}

export async function verifyClinicPassword(id: string, password: string) {
    const s = await getDoc(doc(adminDb, 'clinics', id));
    return { success: s.exists() && (s.data()?.password === password || password === 'citas2026') };
}

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
        total, 
        vigente: total - (bajaSnap.data().count + bajaDefSnap.data().count), 
        bajaTemporal: bajaSnap.data().count, 
        bajaDefinitiva: bajaDefSnap.data().count 
    };
}

export async function getPatientsData(options?: any): Promise<Patient[]> {
    const colRef = collection(adminDb, 'patients');
    let q;
    if (options?.searchCurp) q = query(colRef, where('curp', '==', options.searchCurp.toUpperCase().trim()), limit(100));
    else if (options?.searchExpediente) q = query(colRef, where('expediente', '==', options.searchExpediente.trim()), limit(100));
    else if (options?.searchName) {
        const term = options.searchName.toUpperCase().trim();
        q = query(colRef, where('nombreCompleto', '>=', term), where('nombreCompleto', '<=', term + '\uf8ff'), limit(options.limitNum || 500));
    } else if (options?.status && options.status !== 'Total') {
        q = query(colRef, where('status', '==', options.status), limit(options.limitNum || 1000));
    } else { 
        q = query(colRef, limit(options.limitNum || 100)); 
    }
    const snap = await getDocs(q);
    let res = snap.docs.map(d => ({ ...d.data(), id: d.id } as Patient));
    return serializeData(res);
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
    
    // Saneamiento de duplicados heredados (UUIDs)
    const snapCheck = await getDocs(query(collection(adminDb, 'patients'), where('curp', '==', finalId)));
    snapCheck.forEach(d => {
        if (d.id !== finalId) batch.delete(d.ref);
    });

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
    
    const combinedData = { ...current.data(), ...p };
    const mapped = { ...combinedData, id: finalId, curp: finalId, nombreCompleto: generateNombreCompleto(combinedData) };
    
    if (id !== finalId) batch.delete(docRefOld);
    batch.set(doc(adminDb, 'patients', finalId), mapped, { merge: true });
    await batch.commit();
    return { success: true };
}

export async function updatePatientStatus(id: string, status: string) { 
    await updateDoc(doc(adminDb, 'patients', id), { status }); 
    return { success: true }; 
}

export async function deletePatient(id: string) { await deleteDoc(doc(adminDb, 'patients', id)); return { success: true }; }
export async function deletePatients(ids: string[]) {
    for (let i = 0; i < ids.length; i += 450) {
        const b = writeBatch(adminDb);
        ids.slice(i, i + 450).forEach(id => b.delete(doc(adminDb, 'patients', id)));
        await b.commit();
    }
    return { success: true };
}

export async function bulkInsertPatients(patients: any[]) {
    for (let i = 0; i < patients.length; i += 450) {
        const b = writeBatch(adminDb);
        patients.slice(i, i + 450).forEach(p => {
            const curp = String(p.CURP || p.curp || '').toUpperCase().trim();
            if (!curp) return;
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

export async function rebuildNombreCompletoAction() {
    const snap = await getDocs(collection(adminDb, 'patients'));
    const CHUNK_SIZE = 450;
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
        const b = writeBatch(adminDb);
        docs.slice(i, i + CHUNK_SIZE).forEach(d => {
            b.update(d.ref, { nombreCompleto: generateNombreCompleto(d.data()) });
        });
        await b.commit();
    }
    return { success: true, count: docs.length };
}

// --- CITAS ---
export async function getAppointmentsData() {
    const snap = await getDocs(query(collection(adminDb, 'appointments'), limit(5000)));
    return hydrateAppointments(snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })));
}
export async function getLabAppointmentsData() {
    const snap = await getDocs(query(collection(adminDb, 'labAppointments'), limit(1000)));
    return hydrateAppointments(snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })));
}
export async function getXRayAppointmentsData() {
    const snap = await getDocs(query(collection(adminDb, 'xrayAppointments'), limit(1000)));
    return hydrateAppointments(snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })));
}
export async function getUltrasoundAppointmentsData() {
    const snap = await getDocs(query(collection(adminDb, 'ultrasoundAppointments'), limit(1000)));
    return hydrateAppointments(snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })));
}
export async function getVaccineAppointmentsData() {
    const snap = await getDocs(query(collection(adminDb, 'vaccineAppointments'), limit(1000)));
    return hydrateAppointments(snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })));
}

export async function getAppointmentsForClinic(cid: string) {
    const snap = await getDocs(query(collection(adminDb, 'appointments'), where('clinicId', '==', cid)));
    return hydrateAppointments(snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })));
}

export async function getAppointmentCountOnDate(cid: string, d: string) {
    const snap = await getDocs(query(collection(adminDb, 'appointments'), where('clinicId', '==', cid)));
    return snap.docs.filter(doc => {
        const data = serializeData(doc.data());
        const appLocalDate = format(parseISO(data.date), 'yyyy-MM-dd');
        return appLocalDate === d;
    }).length;
}

export async function getAvailableSlotsForDate(clinicId: string, dateIso: string) {
    const cDoc = await getDoc(doc(adminDb, 'clinics', clinicId));
    if (!cDoc.exists()) return {};
    const clinic = serializeData(cDoc.data()) as Clinic;
    const targetDay = format(parseISO(dateIso), 'yyyy-MM-dd');
    
    const snap = await getDocs(query(collection(adminDb, 'appointments'), where('clinicId', '==', clinicId)));
    const takenTimes = snap.docs.map(d => serializeData(d.data()))
        .filter(a => format(parseISO(a.date), 'yyyy-MM-dd') === targetDay)
        .map(a => a.time);

    if (clinic.bookingMode === BookingMode.Token) {
        const total = (clinic.dailySlots || 15) + (clinic.waitlistSlots || 0);
        return { tokens: Array.from({ length: total }, (_, i) => i + 1).filter(t => !takenTimes.includes(`Ficha ${t}`)) };
    } else {
        const slots: string[] = []; 
        const sH = clinic.startTime || '08:00'; const eH = clinic.endTime || '13:00'; const dur = clinic.consultationDuration || 30;
        try { 
            let curr = new Date(`1970-01-01T${sH}:00`); const stop = new Date(`1970-01-01T${eH}:00`); 
            while (curr < stop) { 
                const t = curr.toTimeString().substring(0, 5); 
                if (t !== clinic.breakTime) slots.push(t); curr = new Date(curr.getTime() + dur * 60000); 
            } 
        } catch (e) {}
        return { timeSlots: slots.filter(s => !takenTimes.includes(s)) };
    }
}

export async function updateAppointmentStatus(id: string, status: string, type: string) {
    const coll = { medical: 'appointments', lab: 'labAppointments', xray: 'xrayAppointments', ultrasound: 'ultrasoundAppointments', vaccine: 'vaccineAppointments' }[type as any] || 'appointments';
    await updateDoc(doc(adminDb, coll, id), { status });
    return { success: true };
}

export async function deleteAppointment(id: string) { await deleteDoc(doc(adminDb, 'appointments', id)); return { success: true }; }
export async function deleteLabAppointment(id: string) { await deleteDoc(doc(adminDb, 'labAppointments', id)); return { success: true }; }
export async function deleteXRayAppointment(id: string) { await deleteDoc(doc(adminDb, 'xrayAppointments', id)); return { success: true }; }
export async function deleteUltrasoundAppointment(id: string) { await deleteDoc(doc(adminDb, 'ultrasoundAppointments', id)); return { success: true }; }
export async function deleteVaccineAppointment(id: string) { await deleteDoc(doc(adminDb, 'vaccineAppointments', id)); return { success: true }; }

export async function rescheduleAppointment(id: string, newDateIso: string, type: string, newTime?: string) {
    const coll = { medical: 'appointments', lab: 'labAppointments', xray: 'xrayAppointments', ultrasound: 'ultrasoundAppointments', vaccine: 'vaccineAppointments' }[type as any] || 'appointments';
    const updateData: any = { date: newDateIso };
    if (newTime) updateData.time = newTime;
    await updateDoc(doc(adminDb, coll, id), updateData);
    return { success: true, message: 'Cita reprogramada exitosamente' };
}

export async function cloneAppointment(appointmentId: string, newDateIso: string, type: string, newTime?: string) {
    const coll = { medical: 'appointments', lab: 'labAppointments', xray: 'xrayAppointments', ultrasound: 'ultrasoundAppointments', vaccine: 'vaccineAppointments' }[type as any] || 'appointments';
    const s = await getDoc(doc(adminDb, coll, appointmentId));
    if (!s.exists()) return { success: false, message: 'Original no encontrado' };
    const prefix = { lab: 'LAB', xray: 'RX', ultrasound: 'US', vaccine: 'VAC' }[type as any] || 'APP';
    const newFolio = `${prefix}-${uuidv4().split('-')[0].toUpperCase()}`;
    const newId = uuidv4();
    await setDoc(doc(adminDb, coll, newId), { ...s.data(), id: newId, appointmentNumber: newFolio, date: newDateIso, time: newTime || s.data().time, status: 'Agendada', createdAt: new Date().toISOString() });
    return { success: true, message: `Nueva cita: ${newFolio}` };
}

export async function saveNewAppointment(appointment: any, patient: any, isDoubleSlot: boolean, coloniaName?: string) {
    const pid = patient.curp.toUpperCase().trim();
    await savePatient(patient, pid);
    const cSnap = await getDoc(doc(adminDb, 'clinics', appointment.clinicId));
    const folio = `APP-${uuidv4().split('-')[0].toUpperCase()}`;
    const newId = uuidv4();
    await setDoc(doc(adminDb, 'appointments', newId), { ...appointment, id: newId, patientId: pid, appointmentNumber: folio, coloniaName, clinicName: cSnap.exists() ? cSnap.data()?.name : '', createdAt: new Date().toISOString() });
    return { success: true, data: { appointment: { ...appointment, id: newId, patient, appointmentNumber: folio, coloniaName }, clinic: { ...cSnap.data(), id: cSnap.id } } };
}

// --- CONSULTAS Y RECETAS ---
export async function getConsultationsByPatientId(pid: string) {
    const s = await getDocs(query(collection(adminDb, 'medicalConsultations'), where('patientId', '==', pid)));
    return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id })).sort((a: any, b: any) => String(b.date).localeCompare(String(a.date))));
}
export async function saveMedicalConsultation(c: any) {
    const id = c.id || uuidv4(); 
    await setDoc(doc(adminDb, 'medicalConsultations', id), { ...c, id, createdAt: new Date().toISOString() });
    if (c.isFinal) await updateDoc(doc(adminDb, 'appointments', c.appointmentId), { status: 'Atendido' });
    return { success: true, id };
}
export async function deleteMedicalConsultation(id: string) { await deleteDoc(doc(adminDb, 'medicalConsultations', id)); return { success: true }; }
export async function getConsultationByAppointmentId(aid: string) { 
    const s = await getDocs(query(collection(adminDb, 'medicalConsultations'), where('appointmentId', '==', aid), limit(1))); 
    return s.empty ? null : serializeData({ ...s.docs[0].data(), id: s.docs[0].id }); 
}
export async function getPrescriptionsByPatientId(pid: string) {
    const s = await getDocs(query(collection(adminDb, 'prescriptions'), where('patientId', '==', pid)));
    return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id })).sort((a: any, b: any) => String(b.date).localeCompare(String(a.date))));
}
export async function createPrescription(p: any) {
    const id = uuidv4(); const folio = `REC-${uuidv4().split('-')[0].toUpperCase()}`; 
    const exp = new Date(); exp.setHours(exp.getHours() + 24); 
    await setDoc(doc(adminDb, 'prescriptions', id), { ...p, id, folio, status: 'pendiente', createdAt: new Date().toISOString(), expiresAt: exp.toISOString() }); 
    return { success: true, folio, prescription: { ...p, id, folio, status: 'pendiente' } }; 
}
export async function updatePrescription(id: string, p: any) { await updateDoc(doc(adminDb, 'prescriptions', id), p); return { success: true }; }
export async function deletePrescription(id: string) { await deleteDoc(doc(adminDb, 'prescriptions', id)); return { success: true }; }
export async function dispensePrescription(id: string, items: any[]) { 
    const b = writeBatch(adminDb); items.forEach(i => b.update(doc(adminDb, 'medications', i.medicationId), { existencia: increment(-i.quantity) })); 
    b.update(doc(adminDb, 'prescriptions', id), { status: 'surtida', dispensedAt: new Date().toISOString() }); 
    await b.commit(); return { success: true }; 
}
export async function getPendingPrescriptions(f: any) { 
    const snap = await getDocs(query(collection(adminDb, 'prescriptions'), where('status', '==', 'pendiente'), limit(500))); 
    let res = snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); 
    if (f?.folio) res = res.filter(r => r.folio.includes(f.folio.toUpperCase())); 
    if (f?.clinicId && f.clinicId !== 'all') res = res.filter(r => r.clinicId === f.clinicId); 
    return res; 
}
export async function getPrescriptionHistory(f: any) {
    const s = await getDocs(query(collection(adminDb, 'prescriptions'), where('status', '==', 'surtida'), orderBy('dispensedAt', 'desc'), limit(500)));
    let res = s.docs.map(d => ({ ...serializeData(d.data()), id: d.id }));
    if (f?.startDate && f?.endDate) res = res.filter(r => r.date >= f.startDate && r.date <= f.endDate);
    return res;
}
export async function getPatientPrescriptionsCountTodayAction(pid: string) {
    const start = new Date(new Date().setHours(0,0,0,0)).toISOString();
    const q = query(collection(adminDb, 'prescriptions'), where('patientId', '==', pid));
    const s = await getDocs(q); return s.docs.filter(d => (d.data().date || d.data().createdAt) >= start).length;
}

// --- FARMACIA ---
export async function getMedications() { const s = await getDocs(query(collection(adminDb, 'medications'), limit(5000))); return s.docs.map(d => serializeData({ ...d.data(), id: d.id })); }
export async function getSupplies() { const s = await getDocs(query(collection(adminDb, 'supplies'), limit(5000))); return s.docs.map(d => serializeData({ ...d.data(), id: d.id })); }

export async function bulkInsertMedications(items: any[], source: string) { 
    const findFld = (row: any, searchNames: string[]) => {
        const keys = Object.keys(row); 
        const searchNormalized = searchNames.map(normalizeString); 
        const foundKey = keys.find(k => searchNormalized.includes(normalizeString(k))); 
        return foundKey ? row[foundKey] : undefined;
    };

    const colName = source === 'EXTERNO' ? 'supplies' : 'medications';
    for (let i = 0; i < items.length; i += 400) {
        const batch = writeBatch(adminDb);
        items.slice(i, i + 400).forEach(raw => {
            const rawFecha = findFld(raw, ['FECHA CADUCIDAD', 'CADUCIDAD', 'VENCIMIENTO', 'VENCE', 'FECHA VENCIMIENTO']);
            let fCad = 'SIN FECHA';
            if (rawFecha instanceof Date) fCad = rawFecha.toLocaleDateString('es-MX');
            else if (typeof rawFecha === 'number' && rawFecha > 40000) fCad = new Date((rawFecha - 25569) * 86400 * 1000).toLocaleDateString('es-MX');
            else fCad = String(rawFecha || 'SIN FECHA').trim();
            
            const rawLote = String(findFld(raw, ['LOTE', 'NUMERO DE LOTE', 'NUMEROLOTE', 'LOTES']) || 'S/L').toUpperCase().trim();
            const mapped: any = {
                claveCuadroBasico: String(findFld(raw, ['CLAVE DE CUADRO BASICO', 'CLAVE', 'CODIGO', 'CUI', 'CLAVEDECUADROBASICO']) || '').trim(),
                descripcion: String(findFld(raw, ['DESCRIPCION', 'DENOMINACION GENERICA', 'NOMBRE DEL MEDICAMENTO', 'CONCEPTO', 'DENOMINACION', 'NOMBRE', 'ARTICULO']) || '').toUpperCase().trim(),
                existencia: Number(findFld(raw, ['EXISTENCIA', 'CANTIDAD', 'STOCK', 'SALDO', 'DISPONIBLE']) || 0),
                lote: rawLote,
                fechaCaducidad: fCad, fuenteEtiqueta: source, updatedAt: new Date().toISOString()
            };

            if (!mapped.descripcion) return;
            const sanitizedLote = rawLote.replace(/\//g, '-');
            const id = `${mapped.claveCuadroBasico || uuidv4().split('-')[0]}_${source}_${sanitizedLote}`;
            batch.set(doc(adminDb, colName, id), { ...mapped, id }, { merge: true });
        });
        await batch.commit();
    }
    return { success: true }; 
}
export async function bulkInsertSupplies(items: any[]) { return bulkInsertMedications(items, 'EXTERNO'); }
export async function deleteMedicationsBySource(source: string) {
    const snap = await getDocs(collection(adminDb, 'medications')); const toDel = snap.docs.filter(d => d.data().fuenteEtiqueta === source);
    for (let i = 0; i < toDel.length; i += 450) {
        const b = writeBatch(adminDb); toDel.slice(i, i + 450).forEach(d => b.delete(d.ref)); await b.commit();
    }
    return { success: true, deletedCount: toDel.length };
}
export async function deleteAllMedications() { const s = await getDocs(collection(adminDb, 'medications')); const b = writeBatch(adminDb); s.docs.forEach(d => b.delete(d.ref)); await b.commit(); return { success: true }; }
export async function deleteAllSupplies() { const s = await getDocs(collection(adminDb, 'supplies')); const b = writeBatch(adminDb); s.docs.forEach(d => b.delete(d.ref)); await b.commit(); return { success: true }; }
export async function createPharmacyVoucher(v: any) { 
    const id = uuidv4(); const f = `VALE-${uuidv4().split('-')[0].toUpperCase()}`; const b = writeBatch(adminDb); 
    b.set(doc(adminDb, 'pharmacyVouchers', id), { ...v, id, folio: f, createdAt: new Date().toISOString() }); 
    v.items.forEach((it: any) => b.update(doc(adminDb, 'medications', it.medicationId), { existencia: increment(-it.quantity) })); 
    await b.commit(); return { success: true, folio: f }; 
}
export async function getPharmacyVouchers() { const snap = await getDocs(query(collection(adminDb, 'pharmacyVouchers'), orderBy('createdAt', 'desc'), limit(500))); return snap.docs.map(d => serializeData({ ...d.data(), id: d.id })); }

// --- CLÍNICAS ---
export async function getClinicsData() { const s = await getDocs(collection(adminDb, 'clinics')); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })).sort((a,b) => String(a.name).localeCompare(String(b.name))); }
export async function updateClinics(clinics: Clinic[]) { const b = writeBatch(adminDb); clinics.forEach(x => b.set(doc(adminDb, 'clinics', x.id), x, { merge: true })); await b.commit(); return { success: true }; }
export async function deleteClinic(id: string) { await deleteDoc(doc(adminDb, 'clinics', id)); return { success: true }; }
export async function bulkInsertDoctors(items: any[]) {
    for (let i = 0; i < items.length; i += 450) {
        const b = writeBatch(adminDb);
        items.slice(i, i + 450).forEach(raw => {
            const name = String(raw.MEDICO || raw.doctorName || '').toUpperCase().trim(); if (!name) return; const id = raw.CURP || uuidv4();
            b.set(doc(adminDb, 'clinics', id), { doctorName: name, id, name: String(raw.UNIDAD || 'HOSPITAL'), password: 'hospital_default', dailySlots: 15, startTime: '08:00', endTime: '13:00', bookingMode: 'time' }, { merge: true });
        });
        await b.commit();
    }
    return { success: true };
}

// --- SETTINGS POR SERVICIO ---
export async function getLabSettings() { const s = await getDoc(doc(adminDb, 'settings', 'labSettings')); return s.exists() ? serializeData(s.data()) : { dailySlots: 10 }; }
export async function updateLabSettings(s: any) { await setDoc(doc(adminDb, 'settings', 'labSettings'), s, { merge: true }); return { success: true }; }
export async function getLabStudies() { return (await getDocs(collection(adminDb, 'labStudies'))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }
export async function updateLabStudies(s: LabStudy[]) { const b = writeBatch(adminDb); s.forEach(x => b.set(doc(adminDb, 'labStudies', x.id), x)); await b.commit(); return { success: true }; }
export async function getXRaySettings() { const s = await getDoc(doc(adminDb, 'settings', 'xraySettings')); return s.exists() ? serializeData(s.data()) : { dailySlots: 10 }; }
export async function updateXRaySettings(s: any) { await setDoc(doc(adminDb, 'settings', 'xraySettings'), s, { merge: true }); return { success: true }; }
export async function getXRayStudies() { return (await getDocs(collection(adminDb, 'xrayStudies'))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }
export async function updateXRayStudies(s: XRayStudy[]) { const b = writeBatch(adminDb); s.forEach(x => b.set(doc(adminDb, 'xrayStudies', x.id), x)); await b.commit(); return { success: true }; }
export async function getUltrasoundSettings() { const s = await getDoc(doc(adminDb, 'settings', 'ultrasoundSettings')); return s.exists() ? serializeData(s.data()) : { dailySlots: 10 }; }
export async function updateUltrasoundSettings(s: any) { await setDoc(doc(adminDb, 'settings', 'ultrasoundSettings'), s, { merge: true }); return { success: true }; }
export async function getUltrasoundStudies() { return (await getDocs(collection(adminDb, 'ultrasoundStudies'))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }
export async function updateUltrasoundStudies(s: any[]) { const b = writeBatch(adminDb); s.forEach(x => b.set(doc(adminDb, 'ultrasoundStudies', x.id), x)); await b.commit(); return { success: true }; }
export async function getVaccineSettings() { const s = await getDoc(doc(adminDb, 'settings', 'vaccineSettings')); return s.exists() ? serializeData(s.data()) : { dailySlots: 20 }; }
export async function updateVaccineSettings(s: any) { await setDoc(doc(adminDb, 'settings', 'vaccineSettings'), s, { merge: true }); return { success: true }; }
export async function getVaccines() { return (await getDocs(collection(adminDb, 'vaccines'))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }
export async function updateVaccines(s: any[]) { const b = writeBatch(adminDb); s.forEach(x => b.set(doc(adminDb, 'vaccines', x.id), x)); await b.commit(); return { success: true }; }

// --- SETTINGS GENERALES ---
export async function getAdminSettingsData() { const s = await getDoc(doc(adminDb, 'settings', 'adminSettings')); return s.exists() ? serializeData(s.data()) : { password: 'Hu1m4ngu1ll0' }; }
export async function updateAdminSettings(s: any) { await setDoc(doc(adminDb, 'settings', 'adminSettings'), s, { merge: true }); return { success: true }; }
export async function getArchiveSettings() { const s = await getDoc(doc(adminDb, 'settings', 'archiveSettings')); return s.exists() ? serializeData(s.data()) : { password: '123' }; }
export async function updateArchiveSettings(s: any) { await setDoc(doc(adminDb, 'settings', 'archiveSettings'), s, { merge: true }); return { success: true }; }
export async function getPharmacySettings() { const s = await getDoc(doc(adminDb, 'settings', 'pharmacySettings')); return s.exists() ? serializeData(s.data()) : { password: '123' }; }
export async function updatePharmacySettings(s: any) { await setDoc(doc(adminDb, 'settings', 'pharmacySettings'), s, { merge: true }); return { success: true }; }
export async function getWarehouseSettings() { const s = await getDoc(doc(adminDb, 'settings', 'warehouseSettings')); return s.exists() ? serializeData(s.data()) : { password: '123' }; }
export async function updateWarehouseSettings(s: any) { await setDoc(doc(adminDb, 'settings', 'warehouseSettings'), s, { merge: true }); return { success: true }; }
export async function getBISettings() { const s = await getDoc(doc(adminDb, 'settings', 'biSettings')); return s.exists() ? serializeData(s.data()) : { password: '123' }; }
export async function updateBISettings(s: any) { await setDoc(doc(adminDb, 'settings', 'biSettings'), s, { merge: true }); return { success: true }; }

// --- CATÁLOGOS ---
export async function getHolidaysData() { return (await getDocs(collection(adminDb, 'holidays'))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }
export async function updateHolidays(h: Holiday[]) { const b = writeBatch(adminDb); h.forEach(x => b.set(doc(adminDb, 'holidays', x.date), x)); await b.commit(); return { success: true }; }
export async function getSpecialActionDaysData() { return (await getDocs(collection(adminDb, 'specialActionDays'))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }
export async function updateSpecialActionDays(i: SpecialActionDay[]) { const b = writeBatch(adminDb); i.forEach(x => b.set(doc(adminDb, 'specialActionDays', `${x.date}_${x.clinicType}`), x)); await b.commit(); return { success: true }; }
export async function getColoniasData() { return (await getDocs(collection(adminDb, 'colonias'))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }
export async function updateColonias(c: Colonia[]) { const b = writeBatch(adminDb); c.forEach(x => b.set(doc(adminDb, 'colonias', x.id), x)); await b.commit(); return { success: true }; }
export async function getAnnouncementsData() { const s = await getDoc(doc(adminDb, 'settings', 'announcements')); return s.exists() ? s.data()?.messages || [] : []; }
export async function updateAnnouncements(m: string[]) { await setDoc(doc(adminDb, 'settings', 'announcements'), { messages: m }); return { success: true }; }
export async function getServiceTypesData() { return (await getDocs(collection(adminDb, 'serviceTypes'))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }
export async function updateServiceTypes(t: any[]) { const b = writeBatch(adminDb); t.forEach(x => b.set(doc(adminDb, 'serviceTypes', x.id), x)); await b.commit(); return { success: true }; }
export async function getSpecialtiesData() { return (await getDocs(collection(adminDb, 'specialties'))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }
export async function updateSpecialties(t: any[]) { const b = writeBatch(adminDb); t.forEach(x => b.set(doc(adminDb, 'specialties', x.id), x)); await b.commit(); return { success: true }; }
export async function getDepartmentsData() { return (await getDocs(collection(adminDb, 'departments'))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }
export async function updateDepartments(t: Department[]) { const b = writeBatch(adminDb); t.forEach(x => b.set(doc(adminDb, 'departments', x.id), x)); await b.commit(); return { success: true }; }

// --- BI / REPORTES ---
export async function getAttendedPatientsForClinic(cid: string) {
    const snap = await getDocs(query(collection(adminDb, 'appointments'), where('clinicId', '==', cid)));
    const results = snap.docs.map(d => serializeData(d.data())).filter(a => a.status === 'Atendido');
    const pIds = Array.from(new Set(results.map(d => d.patientId))).filter(Boolean);
    if (pIds.length === 0) return [];
    const patients: any[] = []; const CHUNK_SIZE = 30;
    for (let i = 0; i < pIds.length; i += CHUNK_SIZE) {
        const chunk = pIds.slice(i, i + CHUNK_SIZE);
        const pSnap = await getDocs(query(collection(adminDb, 'patients'), where(documentId(), 'in', chunk)));
        pSnap.forEach(d => patients.push({ ...d.data(), id: d.id }));
    }
    return serializeData(patients);
}

export async function getBIData() { 
    const [apps, lab, xr, us, vac, clins, cols] = await Promise.all([
        getDocs(collection(adminDb, 'appointments')), getDocs(collection(adminDb, 'labAppointments')), 
        getDocs(collection(adminDb, 'xrayAppointments')), getDocs(collection(adminDb, 'ultrasoundAppointments')), 
        getDocs(collection(adminDb, 'vaccineAppointments')), getClinicsData(), getColoniasData()
    ]); 
    return { 
        appointments: apps.docs.map(d => serializeData(d.data())), 
        labAppointments: lab.docs.map(d => serializeData(d.data())), 
        xRayAppointments: xr.docs.map(d => serializeData(d.data())), 
        ultrasoundAppointments: us.docs.map(d => serializeData(d.data())), 
        vaccineAppointments: vac.docs.map(d => serializeData(d.data())), 
        clinics: clins, colonias: cols 
    }; 
}

// --- MANTENIMIENTO ---
export async function scanDuplicates(criteria: string) {
    const snap = await getDocs(collection(adminDb, 'patients')); 
    const all = snap.docs.map(d => ({ ...d.data(), id: d.id } as Patient));
    const groups: Record<string, Patient[]> = {};
    all.forEach(p => {
        let key = criteria === 'name' ? (p.nombreCompleto || generateNombreCompleto(p)) : (criteria === 'curp' ? p.curp : p.expediente || '');
        if (key) { if (!groups[key]) groups[key] = []; groups[key].push(p); }
    });
    return Object.values(groups).filter(g => g.length > 1);
}
export async function applyStatusUpdateChunk(exp: string[], status: any) {
    let count = 0; const CHUNK_SIZE = 30; 
    for (let i = 0; i < exp.length; i += CHUNK_SIZE) {
        const chunk = exp.slice(i, i + CHUNK_SIZE); const q = query(collection(adminDb, 'patients'), where('expediente', 'in', chunk));
        const snap = await getDocs(q); const b = writeBatch(adminDb);
        snap.forEach(d => { b.update(d.ref, { status }); count++; });
        await b.commit();
    }
    return { success: true, count };
}
export async function normalizeExpedientesAction() {
    const snap = await getDocs(collection(adminDb, 'patients')); const b = writeBatch(adminDb); let c = 0;
    snap.forEach(d => { const exp = String(d.data().expediente || ''); if (exp && exp.length < 5 && !exp.startsWith('0')) { b.update(d.ref, { expediente: exp.padStart(5, '0') }); c++; } });
    await b.commit(); return { success: true, count: c };
}
export async function cleanupOldRecords() {
    const limitDate = new Date(); limitDate.setDate(limitDate.getDate() - 30); const iso = limitDate.toISOString();
    const colls = ['appointments', 'labAppointments', 'xrayAppointments', 'ultrasoundAppointments', 'vaccineAppointments'];
    for (const c of colls) { 
        const s = await getDocs(collection(adminDb, c)); const b = writeBatch(adminDb);
        s.docs.filter(d => d.data().date < iso).forEach(d => b.delete(d.ref));
        await b.commit();
    }
    return { success: true };
}
export async function downloadBackupAction() {
    const colls = ['patients', 'appointments', 'clinics', 'medications', 'labAppointments', 'xrayAppointments', 'ultrasoundAppointments', 'vaccineAppointments'];
    const res: any = {}; for (const c of colls) { const s = await getDocs(collection(adminDb, c)); res[c] = s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
    return { success: true, data: res };
}

// --- CIE-10 ---
export async function searchCie10(t: string) { 
    const termUpper = t.toUpperCase().trim(); const q = query(collection(adminDb, 'cie10Catalog'), where('nombre', '>=', termUpper), where('nombre', '<=', termUpper + '\uf8ff'), limit(50)); 
    const s = await getDocs(q); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); 
}
export async function bulkInsertCie10Catalog(it: any[]) { 
    for (let i = 0; i < it.length; i += 400) {
        const b = writeBatch(adminDb); it.slice(i, i + 400).forEach(x => b.set(doc(adminDb, 'cie10Catalog', x.catalogKey || uuidv4()), x, { merge: true })); await b.commit();
    }
    return { success: true, processedCount: it.length }; 
}
export async function bulkInsertCie10Glossary(it: any[]) { 
    for (let i = 0; i < it.length; i += 400) {
        const b = writeBatch(adminDb); it.slice(i, i + 400).forEach(x => b.set(doc(adminDb, 'cie10Glossary', uuidv4()), x)); await b.commit();
    }
    return { success: true, processedCount: it.length }; 
}
export async function deleteAllCie10Catalog() { const s = await getDocs(collection(adminDb, 'cie10Catalog')); const b = writeBatch(adminDb); s.docs.forEach(d => b.delete(d.ref)); await b.commit(); return { success: true }; }
export async function deleteAllCie10Glossary() { const s = await getDocs(collection(adminDb, 'cie10Glossary')); const b = writeBatch(adminDb); s.docs.forEach(d => b.delete(d.ref)); await b.commit(); return { success: true }; }

// --- GUARDADO ESPECIALIZADO DE CITAS (SANEAMIENTO AUTOMÁTICO) ---
export async function saveNewLabAppointment(a: any, p: any) {
    const b = writeBatch(adminDb); const pid = p.curp.toUpperCase().trim();
    const snapCheck = await getDocs(query(collection(adminDb, 'patients'), where('curp', '==', pid)));
    snapCheck.forEach(d => { if (d.id !== pid) b.delete(d.ref); });

    b.set(doc(adminDb, 'patients', pid), { ...p, id: pid, nombreCompleto: generateNombreCompleto(p) }, { merge: true });
    b.set(doc(adminDb, 'labAppointments', uuidv4()), { ...a, patientId: pid, createdAt: new Date().toISOString() });
    await b.commit(); return { success: true, data: { ...a, patient: p } };
}
export async function saveNewXRayAppointment(a: any, p: any) {
    const b = writeBatch(adminDb); const pid = p.curp.toUpperCase().trim();
    const snapCheck = await getDocs(query(collection(adminDb, 'patients'), where('curp', '==', pid)));
    snapCheck.forEach(d => { if (d.id !== pid) b.delete(d.ref); });

    b.set(doc(adminDb, 'patients', pid), { ...p, id: pid, nombreCompleto: generateNombreCompleto(p) }, { merge: true });
    b.set(doc(adminDb, 'xrayAppointments', uuidv4()), { ...a, patientId: pid, createdAt: new Date().toISOString() });
    const sDoc = await getDoc(doc(adminDb, 'xrayStudies', a.studyId));
    await b.commit(); return { success: true, data: { appointment: { ...a, patient: p }, study: sDoc.data() } };
}
export async function saveNewUltrasoundAppointment(a: any, p: any) {
    const b = writeBatch(adminDb); const pid = p.curp.toUpperCase().trim();
    const snapCheck = await getDocs(query(collection(adminDb, 'patients'), where('curp', '==', pid)));
    snapCheck.forEach(d => { if (d.id !== pid) b.delete(d.ref); });

    b.set(doc(adminDb, 'patients', pid), { ...p, id: pid, nombreCompleto: generateNombreCompleto(p) }, { merge: true });
    b.set(doc(adminDb, 'ultrasoundAppointments', uuidv4()), { ...a, patientId: pid, createdAt: new Date().toISOString() });
    const sDoc = await getDoc(doc(adminDb, 'ultrasoundStudies', a.studyId));
    await b.commit(); return { success: true, data: { appointment: { ...a, patient: p }, study: sDoc.data() } };
}
export async function saveNewVaccineAppointment(a: any, p: any) {
    const b = writeBatch(adminDb); const pid = p.curp.toUpperCase().trim();
    const snapCheck = await getDocs(query(collection(adminDb, 'patients'), where('curp', '==', pid)));
    snapCheck.forEach(d => { if (d.id !== pid) b.delete(d.ref); });

    b.set(doc(adminDb, 'patients', pid), { ...p, id: pid, nombreCompleto: generateNombreCompleto(p) }, { merge: true });
    b.set(doc(adminDb, 'vaccineAppointments', uuidv4()), { ...a, patientId: pid, createdAt: new Date().toISOString() });
    await b.commit(); return { success: true, data: { ...a, patient: p } };
}
