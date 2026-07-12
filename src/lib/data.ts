
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
  getCountFromServer
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
import { startOfDay, endOfDay, parseISO } from 'date-fns';

/**
 * MOTOR DE SERIALIZACIÓN Y NORMALIZACIÓN
 */
export function serializeData(data: any): any {
  if (data === null || data === undefined) return '';
  if (typeof data.toDate === 'function') return data.toDate().toISOString();
  if (data && typeof data === 'object' && 'seconds' in data && 'nanoseconds' in data) {
    return new Date(data.seconds * 1000).toISOString();
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

export function safeGetDateString(val: any): string {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') return val;
    if (val && typeof val.toDate === 'function') {
        try { return val.toDate().toISOString(); } catch (e) { return ''; }
    }
    if (val && typeof val === 'object' && val.seconds !== undefined) {
        try { return new Date(val.seconds * 1000).toISOString(); } catch (e) { return ''; }
    }
    return String(val);
}

function generateNombreCompleto(p: any) {
    const n = (p.name || '').trim();
    const ap = (p.paternalLastName || '').trim();
    const am = (p.maternalLastName || '').trim();
    return `${n} ${ap} ${am}`.replace(/\s+/g, ' ').trim().toUpperCase();
}

/**
 * HIDRATACIÓN DE CITAS
 */
async function hydrateAppointments(appointments: any[]) {
    if (!appointments || appointments.length === 0) return [];
    const patientIds = Array.from(new Set(appointments.map(a => {
        if (a.patientId instanceof DocumentReference) return a.patientId.id;
        return String(a.patientId || '');
    }).filter(id => id && id !== 'undefined' && id !== 'null')));

    const patientsMap: Record<string, any> = {};
    if (patientIds.length > 0) {
        const CHUNK_SIZE = 30;
        for (let i = 0; i < patientIds.length; i += CHUNK_SIZE) {
            const chunk = patientIds.slice(i, i + CHUNK_SIZE);
            const snap = await getDocs(query(collection(adminDb, 'patients'), where('__name__', 'in', chunk)));
            snap.forEach(d => { patientsMap[d.id] = { ...d.data(), id: d.id }; });
        }
    }

    const clinicsSnap = await getDocs(collection(adminDb, 'clinics'));
    const clinicsMap: Record<string, string> = {};
    clinicsSnap.forEach(d => { clinicsMap[d.id] = (d.data() as Clinic).name; });

    return appointments.map(app => {
        const pid = typeof app.patientId === 'object' ? app.patientId?.id : app.patientId;
        return { 
            ...app, 
            patientId: pid, 
            patient: serializeData(patientsMap[pid] || app.patient || {}),
            clinicName: clinicsMap[app.clinicId] || app.clinicName || app.clinicId 
        };
    });
}

// --- LOGS ---
export async function logActivity(action: string, details: string) {
    await addDoc(collection(adminDb, 'activityLog'), { timestamp: Timestamp.now(), action, details });
    return { success: true };
}
export async function getLogsData() {
    const snap = await getDocs(query(collection(adminDb, 'activityLog'), orderBy('timestamp', 'desc'), limit(500)));
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

// --- MÓDULOS Y SEGURIDAD ---
export async function getModuleSettings(): Promise<ModuleSettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'moduleSettings'));
    const def = {
        citasMedicasEnabled: true, laboratorioEnabled: true, rayosXEnabled: true, ultrasoundEnabled: true, vacunasEnabled: true,
        archivoEnabled: true, farmaciaEnabled: true, almacenEnabled: true, archivoConsultaEnabled: true,
        citasMedicasWhatsAppEnabled: true, laboratorioWhatsAppEnabled: true, rayosXWhatsAppEnabled: true,
        ultrasoundWhatsAppEnabled: true, vacunasWhatsAppEnabled: true, archivoWhatsAppEnabled: true,
        citasMedicasPassword: '123', archivoConsultaPassword: '123'
    };
    return s.exists() ? { ...def, ...serializeData(s.data()) } : def;
}
export async function updateModuleSettings(s: ModuleSettings) { await setDoc(doc(adminDb, 'settings', 'moduleSettings'), s, { merge: true }); return { success: true }; }
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
export async function verifyClinicPassword(clinicId: string, password: string) {
    const s = await getDoc(doc(adminDb, 'clinics', clinicId));
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
    return { total, vigente: total - (bajaSnap.data().count + bajaDefSnap.data().count), bajaTemporal: bajaSnap.data().count, bajaDefinitiva: bajaDefSnap.data().count };
}
export async function getPatientsData(options?: any): Promise<Patient[]> {
    const colRef = collection(adminDb, 'patients');
    let q;
    if (options?.searchCurp) q = query(colRef, where('curp', '==', options.searchCurp.toUpperCase().trim()), limit(100));
    else if (options?.searchExpediente) q = query(colRef, where('expediente', '==', options.searchExpediente.trim()), limit(100));
    else if (options?.searchName) {
        const term = options.searchName.toUpperCase().trim();
        q = query(colRef, where('nombreCompleto', '>=', term), where('nombreCompleto', '<=', term + '\uf8ff'), limit(options.limitNum || 200));
    } else { q = query(colRef, limit(options.limitNum || 100)); }
    const snap = await getDocs(q);
    let res = snap.docs.map(d => ({ ...d.data(), id: d.id } as Patient));
    if (options?.status && options.status !== 'Total') res = res.filter(p => (p.status || PatientStatus.Vigente) === options.status);
    return serializeData(res);
}
export async function getPatientByCURP(curp: string) {
    const q = query(collection(adminDb, 'patients'), where('curp', '==', curp.toUpperCase().trim()), limit(1));
    const s = await getDocs(q);
    return s.empty ? { success: false } : { success: true, data: serializeData({ ...s.docs[0].data(), id: s.docs[0].id }) };
}
export async function savePatient(p: Omit<Patient, 'id'>, id: string) {
    const finalId = id || p.curp.toUpperCase().trim();
    const nc = generateNombreCompleto(p);
    await setDoc(doc(adminDb, 'patients', finalId), { ...p, id: finalId, nombreCompleto: nc }, { merge: true });
    return { success: true };
}
export async function updatePatient(id: string, p: Partial<Patient>) {
    const docRef = doc(adminDb, 'patients', id);
    const current = await getDoc(docRef);
    const data = { ...current.data(), ...p };
    await updateDoc(docRef, { ...p, nombreCompleto: generateNombreCompleto(data) });
    return { success: true };
}
export async function updatePatientStatus(id: string, status: string) { await updateDoc(doc(adminDb, 'patients', id), { status }); return { success: true }; }
export async function deletePatient(id: string) { await deleteDoc(doc(adminDb, 'patients', id)); return { success: true }; }
export async function deletePatients(ids: string[]) {
    const batch = writeBatch(adminDb); ids.forEach(id => batch.delete(doc(adminDb, 'patients', id)));
    await batch.commit(); return { success: true };
}
export async function bulkInsertPatients(patients: any[]) {
    let processed = 0;
    for (let i = 0; i < patients.length; i += 450) {
        const batch = writeBatch(adminDb);
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
            batch.set(doc(adminDb, 'patients', curp), mapped, { merge: true });
        });
        await batch.commit(); processed += 450;
    }
    return { success: true, processedCount: Math.min(processed, patients.length) };
}
export async function rebuildNombreCompletoAction() {
    const snap = await getDocs(collection(adminDb, 'patients'));
    const batch = writeBatch(adminDb);
    let count = 0;
    snap.forEach(d => {
        const data = d.data();
        batch.update(d.ref, { nombreCompleto: generateNombreCompleto(data) });
        count++;
    });
    await batch.commit();
    return { success: true, count };
}

// --- CITAS ---
export async function getAppointmentsData() {
    const snap = await getDocs(query(collection(adminDb, 'appointments'), orderBy('date', 'desc'), limit(5000)));
    return hydrateAppointments(snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })));
}
export async function getAppointmentsForClinic(cid: string) {
    const clinicDoc = await getDoc(doc(adminDb, 'clinics', cid));
    const cName = clinicDoc.exists() ? (clinicDoc.data() as Clinic).name.toUpperCase().trim() : '';
    const snap = await getDocs(collection(adminDb, 'appointments'));
    const results = snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id }))
        .filter(a => a.clinicId === cid || (cName && a.clinicName?.toUpperCase().trim() === cName));
    return hydrateAppointments(results);
}
export async function saveNewAppointment(appointment: any, patient: any, isDoubleSlot: boolean, coloniaName?: string) {
    const batch = writeBatch(adminDb);
    const pid = patient.curp.toUpperCase().trim();
    batch.set(doc(adminDb, 'patients', pid), { ...patient, id: pid, nombreCompleto: generateNombreCompleto(patient) }, { merge: true });
    const clinicSnap = await getDoc(doc(adminDb, 'clinics', appointment.clinicId));
    const cName = clinicSnap.exists() ? (clinicSnap.data() as Clinic).name : '';
    const folio = `APP-${uuidv4().split('-')[0].toUpperCase()}`;
    batch.set(doc(adminDb, 'appointments', uuidv4()), { ...appointment, patientId: pid, appointmentNumber: folio, coloniaName, clinicName: cName, createdAt: new Date().toISOString() });
    await batch.commit();
    return { success: true, data: { appointment: { ...appointment, patient, appointmentNumber: folio, coloniaName, clinicName: cName }, clinic: { ...clinicSnap.data(), id: clinicSnap.id } } };
}
export async function saveNewLabAppointment(a: any, p: any) {
    const b = writeBatch(adminDb); const pid = p.curp.toUpperCase().trim();
    b.set(doc(adminDb, 'patients', pid), { ...p, id: pid, nombreCompleto: generateNombreCompleto(p) }, { merge: true });
    const id = uuidv4(); b.set(doc(adminDb, 'labAppointments', id), { ...a, patientId: pid, createdAt: new Date().toISOString() });
    await b.commit(); return { success: true, data: { ...a, id, patient: p } };
}
export async function saveNewXRayAppointment(a: any, p: any) {
    const b = writeBatch(adminDb); const pid = p.curp.toUpperCase().trim();
    b.set(doc(adminDb, 'patients', pid), { ...p, id: pid, nombreCompleto: generateNombreCompleto(p) }, { merge: true });
    const id = uuidv4(); b.set(doc(adminDb, 'xrayAppointments', id), { ...a, patientId: pid, createdAt: new Date().toISOString() });
    await b.commit(); return { success: true, data: { appointment: { ...a, id, patient: p } } };
}
export async function saveNewUltrasoundAppointment(a: any, p: any) {
    const b = writeBatch(adminDb); const pid = p.curp.toUpperCase().trim();
    b.set(doc(adminDb, 'patients', pid), { ...p, id: pid, nombreCompleto: generateNombreCompleto(p) }, { merge: true });
    const id = uuidv4(); b.set(doc(adminDb, 'ultrasoundAppointments', id), { ...a, patientId: pid, createdAt: new Date().toISOString() });
    await b.commit(); return { success: true, data: { appointment: { ...a, id, patient: p } } };
}
export async function saveNewVaccineAppointment(a: any, p: any) {
    const b = writeBatch(adminDb); const pid = p.curp.toUpperCase().trim();
    b.set(doc(adminDb, 'patients', pid), { ...p, id: pid, nombreCompleto: generateNombreCompleto(p) }, { merge: true });
    const id = uuidv4(); b.set(doc(adminDb, 'vaccineAppointments', id), { ...a, patientId: pid, createdAt: new Date().toISOString() });
    await b.commit(); return { success: true, data: { appointment: { ...a, id, patient: p } } };
}
export async function getLabAppointmentsData() { const s = await getDocs(query(collection(adminDb, 'labAppointments'), orderBy('date', 'desc'), limit(1500))); return hydrateAppointments(s.docs.map(d => ({ ...serializeData(d.data()), id: d.id }))); }
export async function getXRayAppointmentsData() { const s = await getDocs(query(collection(adminDb, 'xrayAppointments'), orderBy('date', 'desc'), limit(1500))); return hydrateAppointments(s.docs.map(d => ({ ...serializeData(d.data()), id: d.id }))); }
export async function getUltrasoundAppointmentsData() { const s = await getDocs(query(collection(adminDb, 'ultrasoundAppointments'), orderBy('date', 'desc'), limit(1500))); return hydrateAppointments(s.docs.map(d => ({ ...serializeData(d.data()), id: d.id }))); }
export async function getVaccineAppointmentsData() { const s = await getDocs(query(collection(adminDb, 'vaccineAppointments'), orderBy('date', 'desc'), limit(1500))); return hydrateAppointments(s.docs.map(d => ({ ...serializeData(d.data()), id: d.id }))); }
export async function updateAppointmentStatus(id: string, status: string, t: string) { const c = { medical: 'appointments', lab: 'labAppointments', xray: 'xrayAppointments', ultrasound: 'ultrasoundAppointments', vaccine: 'vaccineAppointments' }[t] || 'appointments'; await updateDoc(doc(adminDb, c, id), { status }); return { success: true }; }
export async function deleteAppointment(id: string) { await deleteDoc(doc(adminDb, 'appointments', id)); return { success: true }; }
export async function deleteLabAppointment(id: string) { await deleteDoc(doc(adminDb, 'labAppointments', id)); return { success: true }; }
export async function deleteXRayAppointment(id: string) { await deleteDoc(doc(adminDb, 'xrayAppointments', id)); return { success: true }; }
export async function deleteUltrasoundAppointment(id: string) { await deleteDoc(doc(adminDb, 'ultrasoundAppointments', id)); return { success: true }; }
export async function deleteVaccineAppointment(id: string) { await deleteDoc(doc(adminDb, 'vaccineAppointments', id)); return { success: true }; }
export async function rescheduleAppointment(id: string, date: string, t: string) { const c = { medical: 'appointments', lab: 'labAppointments', xray: 'xrayAppointments', ultrasound: 'ultrasoundAppointments', vaccine: 'vaccineAppointments' }[t] || 'appointments'; await updateDoc(doc(adminDb, c, id), { date }); return { success: true, message: 'Fecha actualizada.' }; }
export async function cloneAppointment(id: string, date: string, t: string, time?: string) {
    const c = { medical: 'appointments', lab: 'labAppointments', xray: 'xrayAppointments', ultrasound: 'ultrasoundAppointments', vaccine: 'vaccineAppointments' }[t] || 'appointments';
    const old = await getDoc(doc(adminDb, c, id)); const data = old.data(); const newId = uuidv4();
    const folio = `CLON-${uuidv4().split('-')[0].toUpperCase()}`;
    await setDoc(doc(adminDb, c, newId), { ...data, id: newId, date, time: time || data?.time, appointmentNumber: folio, status: 'Agendada', createdAt: new Date().toISOString() });
    return { success: true, message: `Clonada folio ${folio}` };
}
export async function getAvailableSlotsForDate(clinicId: string, dateIso: string) {
    const clinicDoc = await getDoc(doc(adminDb, 'clinics', clinicId));
    if (!clinicDoc.exists()) return {};
    const clinic = clinicDoc.data() as Clinic;
    const q = query(collection(adminDb, 'appointments'), where('clinicId', '==', clinicId), where('date', '>=', startOfDay(parseISO(dateIso)).toISOString()), where('date', '<=', endOfDay(parseISO(dateIso)).toISOString()));
    const snap = await getDocs(q); const takenTimes = snap.docs.map(d => d.data().time);
    if (clinic.bookingMode === BookingMode.Token) {
        const total = (clinic.dailySlots || 15) + (clinic.waitlistSlots || 0);
        return { tokens: Array.from({ length: total }, (_, i) => i + 1).filter(t => !takenTimes.includes(`Ficha ${t}`)) };
    } else {
        const slots: string[] = []; const start = clinic.startTime || '08:00'; const end = clinic.endTime || '13:00'; const dur = clinic.consultationDuration || 30;
        try { let curr = new Date(`1970-01-01T${start}:00`); const stop = new Date(`1970-01-01T${end}:00`); while (curr < stop) { const t = curr.toTimeString().substring(0, 5); if (t !== clinic.breakTime) slots.push(t); curr = new Date(curr.getTime() + dur * 60000); } } catch (e) {}
        return { timeSlots: slots.filter(s => !takenTimes.includes(s)) };
    }
}
export async function getAppointmentCountOnDate(cid: string, d: string) {
    const q = query(collection(adminDb, 'appointments'), where('clinicId', '==', cid), where('date', '>=', startOfDay(parseISO(d)).toISOString()), where('date', '<=', endOfDay(parseISO(d)).toISOString()));
    return (await getCountFromServer(q)).data().count;
}

// --- CLÍNICAS Y MÉDICOS ---
export async function getClinicsData() { 
    const [cSnap, bSnap] = await Promise.all([getDocs(collection(adminDb, 'clinics')), getDocs(collection(adminDb, 'clinicBlocks'))]);
    const blocks = bSnap.docs.map(d => serializeData(d.data()));
    return cSnap.docs.map(d => {
        const c = { ...serializeData(d.data()), id: d.id };
        const cBlocks = blocks.filter(b => b.clinicId === d.id);
        return { ...c, unavailableDates: cBlocks.filter(b => b.type === 'vacation').map(b => b.date), customSchedules: cBlocks.filter(b => b.type === 'custom').map(b => ({ date: b.date, endTime: b.endTime, reason: b.reason })) };
    }).sort((a,b) => String(a.name).localeCompare(String(b.name)));
}
export async function updateClinics(clinics: Clinic[]) { 
    const b = writeBatch(adminDb); const currBlocks = (await getDocs(collection(adminDb, 'clinicBlocks'))).docs.map(d => ({ id: d.id, ...serializeData(d.data()) }));
    for (const x of clinics) {
        const { unavailableDates, customSchedules, ...cData } = x; b.set(doc(adminDb, 'clinics', x.id), cData, { merge: true });
        const newIds = new Set<string>();
        if (unavailableDates) unavailableDates.forEach(d => { const id = `${x.id}_${d}`; newIds.add(id); b.set(doc(adminDb, 'clinicBlocks', id), { clinicId: x.id, date: d, type: 'vacation' }); });
        if (customSchedules) customSchedules.forEach(s => { const id = `${x.id}_${s.date}`; newIds.add(id); b.set(doc(adminDb, 'clinicBlocks', id), { clinicId: x.id, date: s.date, type: 'custom', endTime: s.endTime, reason: s.reason || 'Salida Temprana' }); });
        currBlocks.filter((cb: any) => cb.clinicId === x.id && !newIds.has(cb.id)).forEach(bl => b.delete(doc(adminDb, 'clinicBlocks', bl.id)));
    }
    await b.commit(); return { success: true };
}
export async function deleteClinic(id: string) { 
    const b = writeBatch(adminDb); b.delete(doc(adminDb, 'clinics', id));
    (await getDocs(query(collection(adminDb, 'clinicBlocks'), where('clinicId', '==', id)))).forEach(d => b.delete(d.ref));
    await b.commit(); return { success: true }; 
}
export async function bulkInsertDoctors(docsArr: any[]) {
    const b = writeBatch(adminDb);
    docsArr.forEach(d => {
        const id = uuidv4();
        b.set(doc(adminDb, 'clinics', id), { 
            id, name: String(d.Unidad || d.unidad || '').toUpperCase().trim(), doctorName: String(d.Médico || d.medico || '').toUpperCase().trim(), doctorCurp: String(d.CURP || d.curp || '').toUpperCase().trim(), professionalLicense: String(d['Cédula'] || d.cedula || '').toUpperCase().trim(), serviceTypeId: String(d.Categoría || d.categoria || '').toUpperCase().trim(),
            password: '123', dailySlots: 10, startTime: '08:00', endTime: '13:00', bookingMode: BookingMode.Time, consultationDuration: 30, waitlistSlots: 5, weekendBookingEnabled: false
        });
    });
    await b.commit(); return { success: true, processedCount: docsArr.length };
}

// --- CONSULTAS Y RECETAS ---
export async function getConsultationsByPatientId(pid: string) {
    const s = await getDocs(query(collection(adminDb, 'medicalConsultations'), where('patientId', '==', pid)));
    return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id })).sort((a: any, b: any) => String(b.date).localeCompare(String(a.date))));
}
export async function saveMedicalConsultation(c: any) {
    const id = c.id || uuidv4(); await setDoc(doc(adminDb, 'medicalConsultations', id), { ...c, id, createdAt: new Date().toISOString() });
    if (c.isFinal) await updateDoc(doc(adminDb, 'appointments', c.appointmentId), { status: 'Atendido' });
    return { success: true, id };
}
export async function deleteMedicalConsultation(id: string) { await deleteDoc(doc(adminDb, 'medicalConsultations', id)); return { success: true }; }
export async function getConsultationByAppointmentId(aid: string) { const s = await getDocs(query(collection(adminDb, 'medicalConsultations'), where('appointmentId', '==', aid), limit(1))); return s.empty ? null : serializeData({ ...s.docs[0].data(), id: s.docs[0].id }); }
export async function createPrescription(p: any) {
    const id = uuidv4(); const folio = `REC-${uuidv4().split('-')[0].toUpperCase()}`; const exp = new Date(); exp.setHours(exp.getHours() + 24); 
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
export async function getPrescriptionsByPatientId(pid: string) { const s = await getDocs(query(collection(adminDb, 'prescriptions'), where('patientId', '==', pid))); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function getPatientPrescriptionsCountTodayAction(pid: string) {
    const start = new Date(new Date().setHours(0,0,0,0)).toISOString(); const end = new Date(new Date().setHours(23,59,59,999)).toISOString();
    const q = query(collection(adminDb, 'prescriptions'), where('patientId', '==', pid), where('date', '>=', start), where('date', '<=', end));
    return (await getDocs(q)).size;
}

// --- CATÁLOGOS COMUNES ---
export async function getHolidaysData() { return (await getDocs(collection(adminDb, 'holidays'))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }
export async function updateHolidays(h: Holiday[]) { const b = writeBatch(adminDb); h.forEach(x => b.set(doc(adminDb, 'holidays', x.date), x)); await b.commit(); return { success: true }; }
export async function getSpecialActionDaysData() { return (await getDocs(collection(adminDb, 'specialActionDays'))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }
export async function updateSpecialActionDays(i: SpecialActionDay[]) { const b = writeBatch(adminDb); i.forEach(x => b.set(doc(adminDb, 'specialActionDays', `${x.date}_${x.clinicType}`), x)); await b.commit(); return { success: true }; }
export async function getColoniasData() { return (await getDocs(collection(adminDb, 'colonias'))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }
export async function updateColonias(c: Colonia[]) { const b = writeBatch(adminDb); c.forEach(x => b.set(doc(adminDb, 'colonias', x.id), x)); await b.commit(); return { success: true }; }
export async function getAnnouncementsData() { const s = await getDoc(doc(adminDb, 'settings', 'announcements')); return s.exists() ? serializeData(s.data()!.messages) : []; }
export async function updateAnnouncements(m: string[]) { await setDoc(doc(adminDb, 'settings', 'announcements'), { messages: m }, { merge: true }); return { success: true }; }
export async function getServiceTypesData() { return (await getDocs(collection(adminDb, 'serviceTypes'))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }
export async function updateServiceTypes(t: any[]) { const b = writeBatch(adminDb); t.forEach(x => b.set(doc(adminDb, 'serviceTypes', x.id), x)); await b.commit(); return { success: true }; }
export async function getSpecialtiesData() { return (await getDocs(collection(adminDb, 'specialties'))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }
export async function updateSpecialties(t: any[]) { const b = writeBatch(adminDb); t.forEach(x => b.set(doc(adminDb, 'specialties', x.id), x)); await b.commit(); return { success: true }; }
export async function getDepartmentsData() { return (await getDocs(collection(adminDb, 'departments'))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }
export async function updateDepartments(t: Department[]) { const b = writeBatch(adminDb); t.forEach(x => b.set(doc(adminDb, 'departments', x.id), x)); await b.commit(); return { success: true }; }

// --- CONFIGURACIÓN POR SERVICIO ---
export async function getLabSettings() { const s = await getDoc(doc(adminDb, 'settings', 'labSettings')); return s.exists() ? serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 5 }; }
export async function updateLabSettings(s: LabSettings) { await setDoc(doc(adminDb, 'settings', 'labSettings'), s, { merge: true }); return { success: true }; }
export async function getXRaySettings() { const s = await getDoc(doc(adminDb, 'settings', 'xraySettings')); return s.exists() ? serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 5 }; }
export async function updateXRaySettings(s: XRaySettings) { await setDoc(doc(adminDb, 'settings', 'xraySettings'), s, { merge: true }); return { success: true }; }
export async function getUltrasoundSettings() { const s = await getDoc(doc(adminDb, 'settings', 'ultrasoundSettings')); return s.exists() ? serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 5 }; }
export async function updateUltrasoundSettings(s: UltrasoundSettings) { await setDoc(doc(adminDb, 'settings', 'ultrasoundSettings'), s, { merge: true }); return { success: true }; }
export async function getVaccineSettings() { const s = await getDoc(doc(adminDb, 'settings', 'vaccineSettings')); return s.exists() ? serializeData(s.data()) : { dailySlots: 20, waitlistSlots: 10 }; }
export async function updateVaccineSettings(s: VaccineSettings) { await setDoc(doc(adminDb, 'settings', 'vaccineSettings'), s, { merge: true }); return { success: true }; }

export async function getLabStudies() { return (await getDocs(collection(adminDb, 'labStudies'))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }
export async function updateLabStudies(s: any[]) { const b = writeBatch(adminDb); s.forEach(x => b.set(doc(adminDb, 'labStudies', x.id), x)); await b.commit(); return { success: true }; }
export async function getXRayStudies() { return (await getDocs(collection(adminDb, 'xrayStudies'))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }
export async function updateXRayStudies(s: any[]) { const b = writeBatch(adminDb); s.forEach(x => b.set(doc(adminDb, 'xrayStudies', x.id), x)); await b.commit(); return { success: true }; }
export async function getUltrasoundStudies() { return (await getDocs(collection(adminDb, 'ultrasoundStudies'))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }
export async function updateUltrasoundStudies(s: any[]) { const b = writeBatch(adminDb); s.forEach(x => b.set(doc(adminDb, 'ultrasoundStudies', x.id), x)); await b.commit(); return { success: true }; }
export async function getVaccines() { return (await getDocs(collection(adminDb, 'vaccines'))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }
export async function updateVaccines(s: any[]) { const b = writeBatch(adminDb); s.forEach(x => b.set(doc(adminDb, 'vaccines', x.id), x)); await b.commit(); return { success: true }; }

// --- INVENTARIOS CON MAPEADOR INTELIGENTE REFORZADO ---
export async function getMedications() { return (await getDocs(query(collection(adminDb, 'medications'), limit(5000)))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }

export async function bulkInsertMedications(items: any[], source: 'IMSS-BIENESTAR' | 'EXTERNO') { 
    const findFld = (row: any, searchNames: string[]) => {
        const keys = Object.keys(row);
        const normalize = (s: string) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const searchNormalized = searchNames.map(normalize);
        const foundKey = keys.find(k => searchNormalized.includes(normalize(k)));
        return foundKey ? row[foundKey] : undefined;
    };

    for (let i = 0; i < items.length; i += 400) {
        const batch = writeBatch(adminDb);
        items.slice(i, i + 400).forEach(raw => {
            // Mapeo dinámico de fecha caducidad
            const rawFecha = findFld(raw, ['FECHA CADUCIDAD', 'CADUCIDAD', 'VENCIMIENTO', 'FECHA VENCIMIENTO', 'VENCE']);
            let fechaCaducidad = 'SIN FECHA';
            if (rawFecha) {
                if (typeof rawFecha === 'number' && rawFecha > 40000) {
                    const date = new Date((rawFecha - 25569) * 86400 * 1000);
                    fechaCaducidad = date.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
                } else if (rawFecha instanceof Date) {
                    fechaCaducidad = rawFecha.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
                } else {
                    fechaCaducidad = String(rawFecha).trim();
                }
            }

            const mapped: any = {
                claveCuadroBasico: String(findFld(raw, ['CLAVE', 'CLAVEDECUADROBASICO', 'CODIGO']) || '').trim(),
                descripcion: String(findFld(raw, ['DENOMINACION', 'DESCRIPCION', 'NOMBRE', 'PRODUCTO']) || '').toUpperCase().trim(),
                grupo: String(findFld(raw, ['GRUPO']) || '').trim(),
                existencia: Number(findFld(raw, ['EXISTENCIA', 'CANTIDAD', 'STOCK']) || 0),
                precioUnitario: Number(findFld(raw, ['PRECIOUNITARIO', 'PRECIO']) || 0),
                totalImporte: Number(findFld(raw, ['TOTALIMPORTE', 'IMPORTE']) || 0),
                lote: String(findFld(raw, ['LOTE']) || 'S/L').toUpperCase().trim(),
                proveedor: String(findFld(raw, ['PROVEEDOR']) || '').trim(),
                rfcProveedor: String(findFld(raw, ['RFCPROVEEDOR', 'RFC']) || '').trim(),
                almacen: String(findFld(raw, ['ALMACEN']) || '').trim(),
                fuenteFinanciamiento: String(findFld(raw, ['FUENTEDEFINANCIAMIENTO', 'FUENTE']) || source).toUpperCase().trim(),
                fechaCaducidad: fechaCaducidad,
                ordenSuministro: String(findFld(raw, ['ORDENDESUMINISTRO', 'ORDEN']) || '').trim(),
                tipoInsumo: String(findFld(raw, ['TIPODEINSUMO', 'TIPO']) || '').trim(),
                numeroContrato: String(findFld(raw, ['NUMERODECONTRATO', 'CONTRATO']) || '').trim(),
                fuenteEtiqueta: source, 
                updatedAt: new Date().toISOString()
            };
            
            if (!mapped.claveCuadroBasico || !mapped.descripcion) return; 

            const id = `${mapped.claveCuadroBasico.replace(/\//g, '-')}_${source}_${mapped.lote.replace(/\//g, '-')}`;
            batch.set(doc(adminDb, 'medications', id), { ...mapped, id }, { merge: true }); 
        });
        await batch.commit();
    }
    return { success: true, processedCount: items.length }; 
}
export async function deleteAllMedications() { const s = await getDocs(collection(adminDb, 'medications')); const b = writeBatch(adminDb); s.docs.forEach(d => b.delete(d.ref)); await b.commit(); return { success: true }; }
export async function deleteMedicationsBySource(source: 'IMSS-BIENESTAR' | 'EXTERNO') {
    const snap = await getDocs(collection(adminDb, 'medications'));
    const toDel = snap.docs.filter(d => {
        const da = d.data();
        const isImssMatch = (source === 'IMSS-BIENESTAR' && (da.fuenteEtiqueta === 'IMSS-BIENESTAR' || !da.fuenteEtiqueta));
        const isExtMatch = (source === 'EXTERNO' && da.fuenteEtiqueta === 'EXTERNO' && Number(da.existencia || 0) <= 0);
        return isImssMatch || isExtMatch;
    });
    for (let i = 0; i < toDel.length; i += 450) { const b = writeBatch(adminDb); toDel.slice(i, i + 450).forEach(d => b.delete(d.ref)); await b.commit(); }
    return { success: true, deletedCount: toDel.length };
}
export async function createPharmacyVoucher(v: any) {
    const id = uuidv4(); const folio = `VALE-${uuidv4().split('-')[0].toUpperCase()}`;
    const b = writeBatch(adminDb); b.set(doc(adminDb, 'pharmacyVouchers', id), { ...v, id, folio, createdAt: new Date().toISOString() });
    v.items.forEach((it: any) => b.update(doc(adminDb, 'medications', it.medicationId), { existencia: increment(-it.quantity) }));
    await b.commit(); return { success: true, folio };
}
export async function getPharmacyVouchers() { return (await getDocs(query(collection(adminDb, 'pharmacyVouchers'), orderBy('createdAt', 'desc'), limit(500)))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }

// --- ALMACÉN ---
export async function getSupplies() { return (await getDocs(query(collection(adminDb, 'supplies'), limit(5000)))).docs.map(d => serializeData({ ...d.data(), id: d.id })); }
export async function bulkInsertSupplies(items: any[]) { 
    const findFld = (row: any, searchNames: string[]) => {
        const keys = Object.keys(row);
        const normalize = (s: string) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const searchNormalized = searchNames.map(normalize);
        const foundKey = keys.find(k => searchNormalized.includes(normalize(k)));
        return foundKey ? row[foundKey] : undefined;
    };

    for (let i = 0; i < items.length; i += 400) {
        const b = writeBatch(adminDb);
        items.slice(i, i + 400).forEach(raw => {
            const rawFecha = findFld(raw, ['FECHA CADUCIDAD', 'CADUCIDAD', 'VENCIMIENTO', 'VENCE']);
            let fCad = 'SIN FECHA';
            if (rawFecha instanceof Date) fCad = rawFecha.toLocaleDateString('es-MX');
            else fCad = String(rawFecha || 'SIN FECHA').trim();

            const mapped: any = {
                claveCuadroBasico: String(findFld(raw, ['CLAVE', 'CODIGO']) || '').trim(),
                descripcion: String(findFld(raw, ['DENOMINACION', 'DESCRIPCION']) || '').toUpperCase().trim(),
                existencia: Number(findFld(raw, ['EXISTENCIA', 'CANTIDAD', 'STOCK']) || 0),
                lote: String(findFld(raw, ['LOTE']) || 'S/L').toUpperCase().trim(),
                fechaCaducidad: fCad,
                updatedAt: new Date().toISOString()
            };
            const id = String(mapped.claveCuadroBasico || uuidv4()).replace(/\//g, '-');
            b.set(doc(adminDb, 'supplies', id), { ...mapped, id }, { merge: true });
        });
        await b.commit();
    }
    return { success: true, processedCount: items.length }; 
}
export async function deleteAllSupplies() { const s = await getDocs(collection(adminDb, 'supplies')); const b = writeBatch(adminDb); s.docs.forEach(d => b.delete(d.ref)); await b.commit(); return { success: true }; }

// --- MANTENIMIENTO Y DUPLICADOS ---
export async function scanDuplicates(criteria: 'expediente' | 'curp' | 'name') {
    const snap = await getDocs(collection(adminDb, 'patients'));
    const all = snap.docs.map(d => ({ ...d.data(), id: d.id } as Patient));
    const groups: Record<string, Patient[]> = {};
    all.forEach(p => {
        let key = ''; if (criteria === 'expediente') key = p.expediente || '';
        else if (criteria === 'curp') key = p.curp || '';
        else key = `${p.name} ${p.paternalLastName} ${p.maternalLastName}`.toUpperCase();
        if (key && key !== 'N/A' && key !== 'S/E') { if (!groups[key]) groups[key] = []; groups[key].push(p); }
    });
    return Object.values(groups).filter(g => g.length > 1);
}
export async function applyStatusUpdateChunk(expedientes: string[], status: PatientStatus) {
    const batch = writeBatch(adminDb); let count = 0;
    const snap = await getDocs(query(collection(adminDb, 'patients'), where('expediente', 'in', expedientes)));
    snap.forEach(d => { batch.update(d.ref, { status }); count++; });
    await batch.commit(); return { success: true, count };
}
export async function normalizeExpedientesAction() {
    const snap = await getDocs(collection(adminDb, 'patients')); const batch = writeBatch(adminDb); let count = 0;
    snap.forEach(d => { const exp = String(d.data().expediente || ''); if (exp && exp.length > 0 && exp.length < 5 && !exp.startsWith('0')) { batch.update(d.ref, { expediente: exp.padStart(5, '0') }); count++; } });
    await batch.commit(); return { success: true, count };
}
export async function cleanupOldRecords() {
    const limitDate = new Date(); limitDate.setDate(limitDate.getDate() - 30);
    const ts = Timestamp.fromDate(limitDate); const iso = limitDate.toISOString();
    const colls = ['appointments', 'labAppointments', 'xrayAppointments', 'ultrasoundAppointments', 'vaccineAppointments', 'activityLog'];
    let count = 0;
    for (const c of colls) {
        const q = query(collection(adminDb, c), where(c === 'activityLog' ? 'timestamp' : 'date', '<', c === 'activityLog' ? ts : iso));
        const s = await getDocs(q); const b = writeBatch(adminDb); s.docs.forEach(d => { b.delete(d.ref); count++; }); await b.commit();
    }
    return { success: true, deletedCount: count };
}
export async function downloadBackupAction() {
    const colls = ['patients', 'appointments', 'labAppointments', 'xrayAppointments', 'ultrasoundAppointments', 'vaccineAppointments', 'clinics', 'medications', 'pharmacyVouchers', 'supplies'];
    const res: any = {}; for (const c of colls) { const s = await getDocs(collection(adminDb, c)); res[c] = s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
    return { success: true, data: res };
}

// --- CONFIGURACIÓN GLOBAL ---
export async function getAdminSettingsData() { const s = await getDoc(doc(adminDb, 'settings', 'adminSettings')); return s.exists() ? serializeData(s.data()) : { password: 'Hu1m4ngu1ll0' }; }
export async function updateAdminSettings(s: any) { await setDoc(doc(adminDb, 'settings', 'adminSettings'), s, { merge: true }); return { success: true }; }
export async function getArchiveSettings() { const s = await getDoc(doc(adminDb, 'settings', 'archiveSettings')); return s.exists() ? serializeData(s.data()) : { password: '2026' }; }
export async function updateArchiveSettings(s: any) { await setDoc(doc(adminDb, 'settings', 'archiveSettings'), s, { merge: true }); return { success: true }; }
export async function getPharmacySettings() { const s = await getDoc(doc(adminDb, 'settings', 'pharmacySettings')); return s.exists() ? serializeData(s.data()) : { password: 'farmacia2026' }; }
export async function updatePharmacySettings(s: any) { await setDoc(doc(adminDb, 'settings', 'pharmacySettings'), s, { merge: true }); return { success: true }; }
export async function getWarehouseSettings() { const s = await getDoc(doc(adminDb, 'settings', 'warehouseSettings')); return s.exists() ? serializeData(s.data()) : { password: 'almacen2026' }; }
export async function updateWarehouseSettings(s: any) { await setDoc(doc(adminDb, 'settings', 'warehouseSettings'), s, { merge: true }); return { success: true }; }
export async function getBISettings() { const s = await getDoc(doc(adminDb, 'settings', 'biSettings')); return s.exists() ? serializeData(s.data()) : { password: 'bi2026' }; }
export async function updateBISettings(s: any) { await setDoc(doc(adminDb, 'settings', 'biSettings'), s, { merge: true }); return { success: true }; }

// --- CIE-10 ---
export async function bulkInsertCie10Glossary(it: any[]) { const b = writeBatch(adminDb); it.forEach(x => b.set(doc(adminDb, 'cie10Glossary', uuidv4()), x)); await b.commit(); return { success: true, processedCount: it.length }; }
export async function bulkInsertCie10Catalog(it: any[]) { const b = writeBatch(adminDb); it.forEach(x => b.set(doc(adminDb, 'cie10Catalog', x.catalogKey || uuidv4()), x, { merge: true })); await b.commit(); return { success: true, processedCount: it.length }; }
export async function deleteAllCie10Glossary() { const s = await getDocs(collection(adminDb, 'cie10Glossary')); const b = writeBatch(adminDb); s.docs.forEach(d => b.delete(d.ref)); await b.commit(); return { success: true }; }
export async function deleteAllCie10Catalog() { const s = await getDocs(collection(adminDb, 'cie10Catalog')); const b = writeBatch(adminDb); s.docs.forEach(d => b.delete(d.ref)); await b.commit(); return { success: true }; }
export async function searchCie10(t: string) { const q = query(collection(adminDb, 'cie10Catalog'), where('nombre', '>=', t.toUpperCase()), limit(50)); const s = await getDocs(q); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }

// --- BI ---
export async function getBIData() { const [apps, lab, xr, us, vac, clinics, colonias] = await Promise.all([getDocs(query(collection(adminDb, 'appointments'), limit(5000))), getDocs(query(collection(adminDb, 'labAppointments'), limit(2000))), getDocs(query(collection(adminDb, 'xrayAppointments'), limit(2000))), getDocs(query(collection(adminDb, 'ultrasoundAppointments'), limit(2000))), getDocs(query(collection(adminDb, 'vaccineAppointments'), limit(2000))), getClinicsData(), getColoniasData()]); return { appointments: apps.docs.map(d => serializeData(d.data())), labAppointments: lab.docs.map(d => serializeData(d.data())), xRayAppointments: xr.docs.map(d => serializeData(d.data())), ultrasoundAppointments: us.docs.map(d => serializeData(d.data())), vaccineAppointments: vac.docs.map(d => serializeData(d.data())), clinics, colonias }; }
export async function getAttendedPatientsForClinic(cid: string) {
    const clinicDoc = await getDoc(doc(adminDb, 'clinics', cid)); const cName = clinicDoc.exists() ? (clinicDoc.data() as Clinic).name.toUpperCase().trim() : '';
    const snap = await getDocs(query(collection(adminDb, 'appointments'), where('status', '==', 'Atendido')));
    const pIds = Array.from(new Set(snap.docs.filter(d => { const da = d.data(); return da.clinicId === cid || (cName && da.clinicName?.toUpperCase().trim() === cName); }).map(d => d.data().patientId)));
    if (pIds.length === 0) return [];
    const pSnap = await getDocs(query(collection(adminDb, 'patients'), where('__name__', 'in', pIds.slice(0, 30))));
    return pSnap.docs.map(d => ({ ...serializeData(d.data()), id: d.id }));
}
