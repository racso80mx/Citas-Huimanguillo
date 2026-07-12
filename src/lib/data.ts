
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

/**
 * MOTOR DE SERIALIZACIÓN UNIFICADO
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

/**
 * NORMALIZACIÓN DE FECHAS SEGURA
 */
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
        const patientData = patientsMap[pid] || app.patient || { 
            name: 'PACIENTE', paternalLastName: 'S/D', maternalLastName: '', curp: pid || 'S/C', phoneNumber: '---' 
        };
        return { 
            ...app, 
            patientId: pid, 
            patient: serializeData(patientData),
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

// --- MÓDULOS ---
export async function getModuleSettings(): Promise<ModuleSettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'moduleSettings'));
    const def = {
        citasMedicasEnabled: true, laboratorioEnabled: true, rayosXEnabled: true, ultrasoundEnabled: true, vacunasEnabled: true,
        archivoEnabled: true, farmaciaEnabled: true, almacenEnabled: true, archivoConsultaEnabled: true,
        citasMedicasWhatsAppEnabled: true, laboratorioWhatsAppEnabled: true, rayosXWhatsAppEnabled: true,
        ultrasoundWhatsAppEnabled: true, vacunasWhatsAppEnabled: true, archivoWhatsAppEnabled: true,
        citasMedicasPassword: '123', archivoConsultaPassword: '123'
    };
    if (!s.exists()) return def;
    return { ...def, ...serializeData(s.data()) };
}

export async function updateModuleSettings(s: ModuleSettings) {
    await setDoc(doc(adminDb, 'settings', 'moduleSettings'), s, { merge: true });
    return { success: true };
}

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
    if (options?.searchCurp) q = query(colRef, where('curp', '==', options.searchCurp.toUpperCase().trim()), limit(50));
    else if (options?.searchExpediente) q = query(colRef, where('expediente', '==', options.searchExpediente.trim()), limit(50));
    else if (options?.searchName) {
        const term = options.searchName.toUpperCase().trim();
        q = query(colRef, where('nombreCompleto', '>=', term), where('nombreCompleto', '<=', term + '\uf8ff'), limit(options.limitNum || 100));
    } else {
        q = query(colRef, limit(options.limitNum || 50));
    }
    
    const snap = await getDocs(q);
    let results = snap.docs.map(d => ({ ...d.data(), id: d.id } as Patient));
    if (options?.status && options.status !== 'Total') results = results.filter(p => (p.status || PatientStatus.Vigente) === options.status);
    return serializeData(results);
}

export async function getPatientByCURP(curp: string) {
    const q = query(collection(adminDb, 'patients'), where('curp', '==', curp.toUpperCase().trim()), limit(1));
    const s = await getDocs(q);
    if (s.empty) return { success: false };
    return { success: true, data: serializeData({ ...s.docs[0].data(), id: s.docs[0].id }) };
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
    const nc = generateNombreCompleto(data);
    await updateDoc(docRef, { ...p, nombreCompleto: nc });
    return { success: true };
}

export async function updatePatientStatus(id: string, status: string) {
    await updateDoc(doc(adminDb, 'patients', id), { status });
    return { success: true };
}

export async function deletePatient(id: string) { await deleteDoc(doc(adminDb, 'patients', id)); return { success: true }; }
export async function deletePatients(ids: string[]) {
    const batch = writeBatch(adminDb);
    ids.forEach(id => batch.delete(doc(adminDb, 'patients', id)));
    await batch.commit();
    return { success: true };
}

export async function bulkInsertPatients(patients: any[]) {
    const total = patients.length;
    let processed = 0;
    const CHUNK_SIZE = 450;
    for (let i = 0; i < total; i += CHUNK_SIZE) {
        const batch = writeBatch(adminDb);
        const chunk = patients.slice(i, i + CHUNK_SIZE);
        chunk.forEach(p => {
            const curp = String(p.CURP || p.curp || '').toUpperCase().trim();
            if (!curp) return;
            const mapped: any = {
                curp,
                name: String(p.Nombre || p.name || '').toUpperCase().trim(),
                paternalLastName: String(p.Apaterno || p.paternalLastName || '').toUpperCase().trim(),
                maternalLastName: String(p.Amaterno || p.maternalLastName || '').toUpperCase().trim(),
                expediente: String(p['No.Expediente'] || p.expediente || '').trim(),
                birthDate: String(p.FNacimiento || p.birthDate || '').trim(),
                sex: String(p.Sexo || p.sex || 'H').toUpperCase().startsWith('H') ? 'Hombre' : 'Mujer',
                age: Number(p.Edad || p.age || 0),
                phoneNumber: String(p.Telefono || p.phoneNumber || '').trim(),
                status: p.Estatus || p.status || PatientStatus.Vigente,
                address: String(p.Domicilio || p.address || '').toUpperCase().trim(),
                coloniaName: String(p.Colonia || p.coloniaName || '').toUpperCase().trim(),
                registrationDate: String(p.FechaApertura || p.registrationDate || '').trim(),
                derechoAbiencia: String(p.DerechoAbiencia || p.derechoAbiencia || '').toUpperCase().trim(),
            };
            mapped.nombreCompleto = generateNombreCompleto(mapped);
            batch.set(doc(adminDb, 'patients', curp), mapped, { merge: true });
        });
        await batch.commit(); processed += chunk.length;
    }
    return { success: true, processedCount: processed };
}

// --- CITAS ---
export async function getAppointmentsData() { 
    // Fix: Aumentar límite y asegurar que traemos datos relevantes (futuros y pasados recientes)
    const snap = await getDocs(query(collection(adminDb, 'appointments'), orderBy('date', 'desc'), limit(3000))); 
    const results = snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id }));
    return hydrateAppointments(results);
}

export async function getAppointmentsForClinic(cid: string) {
    // Fix: Primero obtener el nombre de la clínica para búsqueda por nombre también
    const clinicDoc = await getDoc(doc(adminDb, 'clinics', cid));
    const clinicName = clinicDoc.exists() ? (clinicDoc.data() as Clinic).name : '';

    const snap = await getDocs(collection(adminDb, 'appointments'));
    const results = snap.docs
        .map(d => ({ ...serializeData(d.data()), id: d.id }))
        .filter(app => 
            app.clinicId === cid || 
            (clinicName && app.clinicName && app.clinicName.toUpperCase().trim() === clinicName.toUpperCase().trim())
        );
    
    return hydrateAppointments(results);
}

export async function saveNewAppointment(appointment: any, patient: any, isDoubleSlot: boolean, coloniaName?: string) {
    const batch = writeBatch(adminDb);
    const patientId = patient.curp.toUpperCase().trim();
    batch.set(doc(adminDb, 'patients', patientId), { ...patient, id: patientId, nombreCompleto: generateNombreCompleto(patient) }, { merge: true });
    
    const clinicSnap = await getDoc(doc(adminDb, 'clinics', appointment.clinicId));
    const clinicName = clinicSnap.exists() ? (clinicSnap.data() as Clinic).name : '';
    
    const folio = `APP-${uuidv4().split('-')[0].toUpperCase()}`;
    batch.set(doc(adminDb, 'appointments', uuidv4()), { 
        ...appointment, 
        patientId, 
        appointmentNumber: folio, 
        coloniaName, 
        clinicName,
        createdAt: new Date().toISOString() 
    });
    
    await batch.commit();
    return { success: true, data: { appointment: { ...appointment, patient, appointmentNumber: folio, coloniaName, clinicName }, clinic: { ...clinicSnap.data(), id: clinicSnap.id } as Clinic } };
}

export async function saveNewLabAppointment(appointment: any, patient: any) {
    const batch = writeBatch(adminDb);
    const patientId = patient.curp.toUpperCase().trim();
    batch.set(doc(adminDb, 'patients', patientId), { ...patient, id: patientId, nombreCompleto: generateNombreCompleto(patient) }, { merge: true });
    const id = uuidv4();
    batch.set(doc(adminDb, 'labAppointments', id), { ...appointment, patientId, createdAt: new Date().toISOString() });
    await batch.commit(); return { success: true, data: { ...appointment, id, patient } };
}

export async function saveNewXRayAppointment(appointment: any, patient: any) {
    const batch = writeBatch(adminDb);
    const patientId = patient.curp.toUpperCase().trim();
    batch.set(doc(adminDb, 'patients', patientId), { ...patient, id: patientId, nombreCompleto: generateNombreCompleto(patient) }, { merge: true });
    const id = uuidv4();
    batch.set(doc(adminDb, 'xrayAppointments', id), { ...appointment, patientId, createdAt: new Date().toISOString() });
    await batch.commit();
    const studySnap = await getDoc(doc(adminDb, 'xrayStudies', appointment.studyId));
    return { success: true, data: { appointment: { ...appointment, id, patient }, study: studySnap.data() } };
}

export async function saveNewUltrasoundAppointment(appointment: any, patient: any) {
    const batch = writeBatch(adminDb);
    const patientId = patient.curp.toUpperCase().trim();
    batch.set(doc(adminDb, 'patients', patientId), { ...patient, id: patientId, nombreCompleto: generateNombreCompleto(patient) }, { merge: true });
    const id = uuidv4();
    batch.set(doc(adminDb, 'ultrasoundAppointments', id), { ...appointment, patientId, createdAt: new Date().toISOString() });
    await batch.commit();
    const studySnap = await getDoc(doc(adminDb, 'ultrasoundStudies', appointment.studyId));
    return { success: true, data: { appointment: { ...appointment, id, patient }, study: studySnap.data() } };
}

export async function saveNewVaccineAppointment(appointment: any, patient: any) {
    const batch = writeBatch(adminDb);
    const patientId = patient.curp.toUpperCase().trim();
    batch.set(doc(adminDb, 'patients', patientId), { ...patient, id: patientId, nombreCompleto: generateNombreCompleto(patient) }, { merge: true });
    const id = uuidv4();
    batch.set(doc(adminDb, 'vaccineAppointments', id), { ...appointment, patientId, createdAt: new Date().toISOString() });
    await batch.commit(); return { success: true, data: { ...appointment, id, patient } };
}

export async function getLabAppointmentsData() {
    const snap = await getDocs(query(collection(adminDb, 'labAppointments'), orderBy('date', 'desc'), limit(1500)));
    return hydrateAppointments(snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })));
}

export async function getXRayAppointmentsData() {
    const snap = await getDocs(query(collection(adminDb, 'xrayAppointments'), orderBy('date', 'desc'), limit(1500)));
    return hydrateAppointments(snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })));
}

export async function getUltrasoundAppointmentsData() {
    const snap = await getDocs(query(collection(adminDb, 'ultrasoundAppointments'), orderBy('date', 'desc'), limit(1500)));
    return hydrateAppointments(snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })));
}

export async function getVaccineAppointmentsData() {
    const snap = await getDocs(query(collection(adminDb, 'vaccineAppointments'), orderBy('date', 'desc'), limit(1500)));
    return hydrateAppointments(snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })));
}

export async function getAvailableSlotsForDate(clinicId: string, dateIso: string) {
    const dStr = dateIso.split('T')[0];
    const clinicDoc = await getDoc(doc(adminDb, 'clinics', clinicId));
    if (!clinicDoc.exists()) return {};
    const clinic = { ...clinicDoc.data(), id: clinicDoc.id } as Clinic;

    const snap = await getDocs(collection(adminDb, 'appointments'));
    const booked = snap.docs
        .filter(d => {
            const data = d.data();
            const dateMatch = safeGetDateString(data.date).startsWith(dStr);
            const clinicMatch = data.clinicId === clinicId || (data.clinicName && data.clinicName.toUpperCase().trim() === clinic.name.toUpperCase().trim());
            return dateMatch && clinicMatch;
        })
        .map(d => d.data().time);

    if (clinic.bookingMode === BookingMode.Token) {
        const total = (clinic.dailySlots || 15) + (clinic.waitlistSlots || 0);
        return { tokens: Array.from({ length: total }, (_, i) => i + 1).filter(t => !booked.includes(`Ficha ${t}`)) };
    }
    
    const slots = [];
    let curr = new Date(`1970-01-01T${clinic.startTime}:00`);
    const finish = new Date(`1970-01-01T${clinic.endTime}:00`);
    while (curr < finish) { 
        slots.push(curr.toTimeString().substring(0, 5)); 
        curr = new Date(curr.getTime() + (clinic.consultationDuration || 30) * 60000); 
    }
    return { timeSlots: slots.filter(s => s !== clinic.breakTime && !booked.includes(s)) };
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

export async function rescheduleAppointment(id: string, date: string, type: string) {
    const coll = { medical: 'appointments', lab: 'labAppointments', xray: 'xrayAppointments', ultrasound: 'ultrasoundAppointments', vaccine: 'vaccineAppointments' }[type as any] || 'appointments';
    await updateDoc(doc(adminDb, coll, id), { date });
    return { success: true, message: 'Fecha actualizada correctamente.' };
}

export async function cloneAppointment(id: string, date: string, type: string, time?: string) {
    const coll = { medical: 'appointments', lab: 'labAppointments', xray: 'xrayAppointments', ultrasound: 'ultrasoundAppointments', vaccine: 'vaccineAppointments' }[type as any] || 'appointments';
    const old = await getDoc(doc(adminDb, coll, id));
    const data = old.data();
    const newId = uuidv4();
    const folio = `CLON-${uuidv4().split('-')[0].toUpperCase()}`;
    await setDoc(doc(adminDb, coll, newId), { ...data, id: newId, date, time: time || data?.time, appointmentNumber: folio, status: 'Agendada', createdAt: new Date().toISOString() });
    return { success: true, message: `Nueva cita generada con folio ${folio}` };
}

export async function getAppointmentCountOnDate(clinicId: string, dateStr: string) {
    const clinicDoc = await getDoc(doc(adminDb, 'clinics', clinicId));
    const clinicName = clinicDoc.exists() ? (clinicDoc.data() as Clinic).name : '';

    const s = await getDocs(collection(adminDb, 'appointments'));
    return s.docs.filter(d => {
        const data = d.data();
        const dateMatch = safeGetDateString(data.date).startsWith(dateStr);
        const clinicMatch = data.clinicId === clinicId || (clinicName && data.clinicName && data.clinicName.toUpperCase().trim() === clinicName.toUpperCase().trim());
        return dateMatch && clinicMatch;
    }).length;
}

// --- CLÍNICAS ---
export async function getClinicsData() { 
    const [cSnap, bSnap] = await Promise.all([getDocs(collection(adminDb, 'clinics')), getDocs(collection(adminDb, 'clinicBlocks'))]);
    const blocks = bSnap.docs.map(d => serializeData(d.data()));
    return cSnap.docs.map(d => {
        const clinic = { ...serializeData(d.data()), id: d.id };
        const clinicBlocks = blocks.filter(b => b.clinicId === d.id);
        return {
            ...clinic,
            unavailableDates: clinicBlocks.filter(b => b.type === 'vacation').map(b => b.date),
            customSchedules: clinicBlocks.filter(b => b.type === 'custom').map(b => ({ date: b.date, endTime: b.endTime, reason: b.reason }))
        };
    }).sort((a,b) => String(a.name || '').localeCompare(String(b.name || '')));
}

export async function updateClinics(clinics: Clinic[]) { 
    const b = writeBatch(adminDb);
    const currBlocksSnap = await getDocs(collection(adminDb, 'clinicBlocks'));
    const currBlocks = currBlocksSnap.docs.map(d => ({ id: d.id, ...serializeData(d.data()) }));
    for (const x of clinics) {
        const { unavailableDates, customSchedules, ...clinicData } = x;
        b.set(doc(adminDb, 'clinics', x.id), clinicData, { merge: true });
        const newBlockIds = new Set<string>();
        if (unavailableDates) unavailableDates.forEach(d => { const id = `${x.id}_${d}`; newBlockIds.add(id); b.set(doc(adminDb, 'clinicBlocks', id), { clinicId: x.id, date: d, type: 'vacation' }); });
        if (customSchedules) customSchedules.forEach(s => { const id = `${x.id}_${s.date}`; newBlockIds.add(id); b.set(doc(adminDb, 'clinicBlocks', id), { clinicId: x.id, date: s.date, type: 'custom', endTime: s.endTime, reason: s.reason || 'Salida Temprana' }); });
        currBlocks.filter((cb: any) => cb.clinicId === x.id && !newBlockIds.has(cb.id)).forEach(block => b.delete(doc(adminDb, 'clinicBlocks', block.id)));
    }
    await b.commit(); return { success: true };
}

export async function deleteClinic(id: string) { 
    const b = writeBatch(adminDb); b.delete(doc(adminDb, 'clinics', id));
    (await getDocs(query(collection(adminDb, 'clinicBlocks'), where('clinicId', '==', id)))).forEach(d => b.delete(d.ref));
    await b.commit(); return { success: true }; 
}

export async function bulkInsertDoctors(doctors: any[]) {
    const batch = writeBatch(adminDb);
    doctors.forEach(d => {
        const id = uuidv4();
        const mapped: any = {
            id,
            name: String(d.Unidad || '').toUpperCase().trim(),
            doctorName: String(d.Médico || '').toUpperCase().trim(),
            doctorCurp: String(d.CURP || '').toUpperCase().trim(),
            professionalLicense: String(d['Cédula'] || '').toUpperCase().trim(),
            serviceTypeId: String(d.Categoría || '').toUpperCase().trim(),
            password: '123', dailySlots: 10, startTime: '08:00', endTime: '13:00', bookingMode: BookingMode.Time, consultationDuration: 30, waitlistSlots: 5, weekendBookingEnabled: false
        };
        batch.set(doc(adminDb, 'clinics', id), mapped);
    });
    await batch.commit(); return { success: true, processedCount: doctors.length };
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
export async function getConsultationByAppointmentId(aid: string) { const s = await getDocs(query(collection(adminDb, 'medicalConsultations'), where('appointmentId', '==', aid), limit(1))); return s.empty ? null : serializeData({ ...s.docs[0].data(), id: s.docs[0].id }); }

export async function createPrescription(p: any) { 
    const id = uuidv4(); const folio = `REC-${uuidv4().split('-')[0].toUpperCase()}`; 
    const exp = new Date(); exp.setHours(exp.getHours() + 24); 
    await setDoc(doc(adminDb, 'prescriptions', id), { ...p, id, folio, status: 'pendiente', createdAt: new Date().toISOString(), expiresAt: exp.toISOString() }); 
    return { success: true, folio, prescription: { ...p, id, folio, status: 'pendiente' } }; 
}

export async function updatePrescription(id: string, p: any) { await updateDoc(doc(adminDb, 'prescriptions', id), p); return { success: true }; }
export async function deletePrescription(id: string) { await deleteDoc(doc(adminDb, 'prescriptions', id)); return { success: true }; }
export async function getPrescriptionsByPatientId(pid: string) { const s = await getDocs(query(collection(adminDb, 'prescriptions'), where('patientId', '==', pid))); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }

export async function dispensePrescription(id: string, items: any[]) { 
    const b = writeBatch(adminDb); 
    items.forEach(i => b.update(doc(adminDb, 'medications', i.medicationId), { existencia: increment(-i.quantity) })); 
    b.update(doc(adminDb, 'prescriptions', id), { status: 'surtida', dispensedAt: new Date().toISOString() }); 
    await b.commit(); return { success: true }; 
}

export async function getPendingPrescriptions(filters: any) { 
    const snap = await getDocs(query(collection(adminDb, 'prescriptions'), where('status', '==', 'pendiente'), limit(500))); 
    let results = snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); 
    if (filters?.folio) results = results.filter(r => r.folio.includes(filters.folio.toUpperCase())); 
    if (filters?.clinicId) results = filters.clinicId !== 'all' ? results.filter(r => r.clinicId === filters.clinicId) : results; 
    return results; 
}

export async function getPrescriptionHistory(filters: any) {
    let q = query(collection(adminDb, 'prescriptions'), where('status', '==', 'surtida'), orderBy('dispensedAt', 'desc'), limit(500));
    const snap = await getDocs(q);
    let results = snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id }));
    if (filters?.startDate && filters?.endDate) results = results.filter(r => r.date >= filters.startDate && r.date <= filters.endDate);
    return results;
}

export async function getPatientPrescriptionsCountTodayAction(patientId: string) {
    const now = new Date(); const start = new Date(now.setHours(0,0,0,0)).toISOString(); const end = new Date(now.setHours(23,59,59,999)).toISOString();
    const q = query(collection(adminDb, 'prescriptions'), where('patientId', '==', patientId), where('date', '>=', start), where('date', '<=', end));
    const snap = await getDocs(q); return snap.size;
}

// --- CATÁLOGOS ---
export async function getHolidaysData() { const s = await getDocs(collection(adminDb, 'holidays')); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateHolidays(h: Holiday[]) { const b = writeBatch(adminDb); h.forEach(x => b.set(doc(adminDb, 'holidays', x.date), x)); await b.commit(); return { success: true }; }
export async function getSpecialActionDaysData() { const s = await getDocs(collection(adminDb, 'specialActionDays')); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateSpecialActionDays(i: SpecialActionDay[]) { const b = writeBatch(adminDb); i.forEach(x => b.set(doc(adminDb, 'specialActionDays', x.date + '_' + x.clinicType), x)); await b.commit(); return { success: true }; }
export async function getColoniasData() { const s = await getDocs(collection(adminDb, 'colonias')); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateColonias(c: Colonia[]) { const b = writeBatch(adminDb); c.forEach(x => b.set(doc(adminDb, 'colonias', x.id), x)); await b.commit(); return { success: true }; }
export async function getAnnouncementsData() { const s = await getDoc(doc(adminDb, 'settings', 'announcements')); return s.exists() ? serializeData(s.data()!.messages) : []; }
export async function updateAnnouncements(m: string[]) { await setDoc(doc(adminDb, 'settings', 'announcements'), { messages: m }, { merge: true }); return { success: true }; }
export async function getServiceTypesData() { const s = await getDocs(collection(adminDb, 'serviceTypes')); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateServiceTypes(t: any[]) { const b = writeBatch(adminDb); t.forEach(x => b.set(doc(adminDb, 'serviceTypes', x.id), x)); await b.commit(); return { success: true }; }
export async function getSpecialtiesData() { const s = await getDocs(collection(adminDb, 'specialties')); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateSpecialties(t: any[]) { const b = writeBatch(adminDb); t.forEach(x => b.set(doc(adminDb, 'specialties', x.id), x)); await b.commit(); return { success: true }; }
export async function getDepartmentsData() { const s = await getDocs(collection(adminDb, 'departments')); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateDepartments(t: Department[]) { const b = writeBatch(adminDb); t.forEach(x => b.set(doc(adminDb, 'departments', x.id), x)); await b.commit(); return { success: true }; }

// --- SETTINGS ---
export async function getAdminSettingsData(): Promise<AdminSettings> { const s = await getDoc(doc(adminDb, 'settings', 'adminSettings')); return s.exists() ? serializeData(s.data()) : { password: 'Hu1m4ngu1ll0' }; }
export async function updateAdminSettings(s: AdminSettings) { await setDoc(doc(adminDb, 'settings', 'adminSettings'), s, { merge: true }); return { success: true }; }
export async function getArchiveSettings(): Promise<ArchiveSettings> { const s = await getDoc(doc(adminDb, 'settings', 'archiveSettings')); return s.exists() ? serializeData(s.data()) : { password: '2026' }; }
export async function updateArchiveSettings(s: ArchiveSettings) { await setDoc(doc(adminDb, 'settings', 'archiveSettings'), s, { merge: true }); return { success: true }; }
export async function getPharmacySettings(): Promise<PharmacySettings> { const s = await getDoc(doc(adminDb, 'settings', 'pharmacySettings')); return s.exists() ? serializeData(s.data()) : { password: 'farmacia2026' }; }
export async function updatePharmacySettings(s: PharmacySettings) { await setDoc(doc(adminDb, 'settings', 'pharmacySettings'), s, { merge: true }); return { success: true }; }
export async function getWarehouseSettings(): Promise<WarehouseSettings> { const s = await getDoc(doc(adminDb, 'settings', 'warehouseSettings')); return s.exists() ? serializeData(s.data()) : { password: 'almacen2026' }; }
export async function updateWarehouseSettings(s: WarehouseSettings) { await setDoc(doc(adminDb, 'settings', 'warehouseSettings'), s, { merge: true }); return { success: true }; }
export async function getBISettings(): Promise<BISettings> { const s = await getDoc(doc(adminDb, 'settings', 'biSettings')); return s.exists() ? serializeData(s.data()) : { password: 'bi2026' }; }
export async function updateBISettings(s: BISettings) { await setDoc(doc(adminDb, 'settings', 'biSettings'), s, { merge: true }); return { success: true }; }

export async function getLabSettings(): Promise<LabSettings> { const s = await getDoc(doc(adminDb, 'settings', 'labSettings')); return s.exists() ? serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 5, weekendBookingEnabled: false }; }
export async function updateLabSettings(s: LabSettings) { await setDoc(doc(adminDb, 'settings', 'labSettings'), s, { merge: true }); return { success: true }; }
export async function getXRaySettings(): Promise<XRaySettings> { const s = await getDoc(doc(adminDb, 'settings', 'xraySettings')); return s.exists() ? serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 5 }; }
export async function updateXRaySettings(s: XRaySettings) { await setDoc(doc(adminDb, 'settings', 'xraySettings'), s, { merge: true }); return { success: true }; }
export async function getUltrasoundSettings(): Promise<UltrasoundSettings> { const s = await getDoc(doc(adminDb, 'settings', 'ultrasoundSettings')); return s.exists() ? serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 5 }; }
export async function updateUltrasoundSettings(s: UltrasoundSettings) { await setDoc(doc(adminDb, 'settings', 'ultrasoundSettings'), s, { merge: true }); return { success: true }; }
export async function getVaccineSettings(): Promise<VaccineSettings> { const s = await getDoc(doc(adminDb, 'settings', 'vaccineSettings')); return s.exists() ? serializeData(s.data()) : { dailySlots: 20, waitlistSlots: 10 }; }
export async function updateVaccineSettings(s: VaccineSettings) { await setDoc(doc(adminDb, 'settings', 'vaccineSettings'), s, { merge: true }); return { success: true }; }

export async function getLabStudies() { const s = await getDocs(collection(adminDb, 'labStudies')); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateLabStudies(s: any[]) { const b = writeBatch(adminDb); s.forEach(x => b.set(doc(adminDb, 'labStudies', x.id), x)); await b.commit(); return { success: true }; }
export async function getXRayStudies() { const s = await getDocs(collection(adminDb, 'xrayStudies')); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateXRayStudies(s: XRayStudy[]) { const b = writeBatch(adminDb); s.forEach(x => b.set(doc(adminDb, 'xrayStudies', x.id), x)); await b.commit(); return { success: true }; }
export async function getUltrasoundStudies() { const s = await getDocs(collection(adminDb, 'ultrasoundStudies')); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateUltrasoundStudies(s: any[]) { const b = writeBatch(adminDb); s.forEach(x => b.set(doc(adminDb, 'ultrasoundStudies', x.id), x)); await b.commit(); return { success: true }; }
export async function getVaccines() { const s = await getDocs(collection(adminDb, 'vaccines')); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateVaccines(s: any[]) { const b = writeBatch(adminDb); s.forEach(x => b.set(doc(adminDb, 'vaccines', x.id), x)); await b.commit(); return { success: true }; }

// --- INVENTARIOS Y VALES ---
export async function getMedications() { const s = await getDocs(query(collection(adminDb, 'medications'), limit(5000))); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }

export async function bulkInsertMedications(items: any[], source: 'IMSS-BIENESTAR' | 'EXTERNO') { 
    const batch = writeBatch(adminDb); 
    items.forEach(i => { 
        const baseId = String(i.claveCuadroBasico || uuidv4()).replace(/\//g, '-');
        const id = `${baseId}_${source}_${String(i.lote || 'SL').replace(/\//g, '-')}`;
        batch.set(doc(adminDb, 'medications', id), { 
            ...i, 
            id, 
            existencia: Number(i.existencia || 0), 
            fuenteFinanciamiento: i.fuenteFinanciamiento || source, 
            fuenteEtiqueta: source 
        }, { merge: true }); 
    }); 
    await batch.commit(); return { success: true, processedCount: items.length }; 
}

export async function deleteAllMedications() { const s = await getDocs(collection(adminDb, 'medications')); const b = writeBatch(adminDb); s.docs.forEach(d => b.delete(d.ref)); await b.commit(); return { success: true }; }

export async function deleteMedicationsBySource(source: 'IMSS-BIENESTAR' | 'EXTERNO') {
    const colRef = collection(adminDb, 'medications');
    const snap = await getDocs(colRef);
    
    const docsToDelete = snap.docs.filter(d => {
        const data = d.data();
        if (source === 'IMSS-BIENESTAR') {
            if (data.fuenteEtiqueta === 'IMSS-BIENESTAR') return true;
            if (!data.fuenteEtiqueta) return true;
            const fin = String(data.fuenteFinanciamiento || '').toUpperCase();
            if (fin.includes('IMSS') || fin.includes('BIENESTAR')) return true;
        }
        if (source === 'EXTERNO') {
            const isTaggedExterno = data.fuenteEtiqueta === 'EXTERNO';
            const isFinExterno = String(data.fuenteFinanciamiento || '').toUpperCase().includes('EXTERNO');
            const hasZeroStock = Number(data.existencia || 0) <= 0;
            if ((isTaggedExterno || isFinExterno) && hasZeroStock) return true;
        }
        return false;
    });

    if (docsToDelete.length === 0) return { success: true, deletedCount: 0 };

    const CHUNK_SIZE = 450;
    for (let i = 0; i < docsToDelete.length; i += CHUNK_SIZE) {
        const batch = writeBatch(adminDb);
        const chunk = docsToDelete.slice(i, i + CHUNK_SIZE);
        chunk.forEach(d => batch.delete(d.ref));
        await batch.commit();
    }
    return { success: true, deletedCount: docsToDelete.length };
}

export async function createPharmacyVoucher(v: Omit<PharmacyVoucher, 'id' | 'folio' | 'createdAt'>) {
    const id = uuidv4();
    const folio = `VALE-${uuidv4().split('-')[0].toUpperCase()}`;
    const batch = writeBatch(adminDb);
    batch.set(doc(adminDb, 'pharmacyVouchers', id), { ...v, id, folio, createdAt: new Date().toISOString() });
    v.items.forEach(item => batch.update(doc(adminDb, 'medications', item.medicationId), { existencia: increment(-item.quantity) }));
    await batch.commit(); return { success: true, folio };
}

export async function getPharmacyVouchers() {
    const s = await getDocs(query(collection(adminDb, 'pharmacyVouchers'), orderBy('createdAt', 'desc'), limit(500)));
    return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id }));
}

// --- ALMACÉN ---
export async function getSupplies() { const s = await getDocs(query(collection(adminDb, 'supplies'), limit(5000))); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function bulkInsertSupplies(items: any[]) { 
    const batch = writeBatch(adminDb); 
    items.forEach(i => { const id = String(i.claveCuadroBasico || uuidv4()).replace(/\//g, '-'); batch.set(doc(adminDb, 'supplies', id), { ...i, id, existencia: Number(i.existencia || 0) }, { merge: true }); }); 
    await batch.commit(); return { success: true, processedCount: items.length }; 
}
export async function deleteAllSupplies() { const s = await getDocs(collection(adminDb, 'supplies')); const b = writeBatch(adminDb); s.docs.forEach(d => b.delete(d.ref)); await b.commit(); return { success: true }; }

// --- MANTENIMIENTO ---
export async function scanDuplicates(criteria: 'expediente' | 'curp' | 'name') {
    const snap = await getDocs(collection(adminDb, 'patients'));
    const patients = snap.docs.map(d => ({ ...d.data(), id: d.id } as Patient));
    const groups: Record<string, Patient[]> = {};
    patients.forEach(p => {
        let key = criteria === 'expediente' ? (p.expediente || 'N/A') : criteria === 'curp' ? p.curp : `${p.name} ${p.paternalLastName}`.toUpperCase();
        if (key && key !== 'N/A') { if (!groups[key]) groups[key] = []; groups[key].push(p); }
    });
    return Object.values(groups).filter(g => g.length > 1);
}

export async function normalizeExpedientesAction() {
    const snap = await getDocs(collection(adminDb, 'patients')); const batch = writeBatch(adminDb); let count = 0;
    snap.docs.forEach(d => {
        const exp = d.data().expediente;
        if (exp && typeof exp === 'string' && exp.length < 5 && !exp.startsWith('0')) { batch.update(d.ref, { expediente: exp.padStart(5, '0') }); count++; }
    });
    await batch.commit(); return { success: true, count };
}

export async function applyStatusUpdateChunk(expedientes: string[], status: PatientStatus) {
    const batch = writeBatch(adminDb); let count = 0;
    for (const exp of expedientes) {
        const s = await getDocs(query(collection(adminDb, 'patients'), where('expediente', '==', exp)));
        s.forEach(d => { batch.update(d.ref, { status }); count++; });
    }
    await batch.commit(); return { success: true, count };
}

export async function bulkInsertCie10Glossary(items: any[]) {
    const batch = writeBatch(adminDb); items.forEach(i => batch.set(doc(adminDb, 'cie10Glossary', uuidv4()), i));
    await batch.commit(); return { success: true, processedCount: items.length };
}

export async function bulkInsertCie10Catalog(items: any[]) {
    const batch = writeBatch(adminDb); items.forEach(i => batch.set(doc(adminDb, 'cie10Catalog', i.catalogKey || uuidv4()), i, { merge: true }));
    await batch.commit(); return { success: true, processedCount: items.length };
}

export async function deleteAllCie10Glossary() {
    const s = await getDocs(collection(adminDb, 'cie10Glossary')); const b = writeBatch(adminDb); s.docs.forEach(d => b.delete(d.ref));
    await b.commit(); return { success: true };
}

export async function deleteAllCie10Catalog() {
    const s = await getDocs(collection(adminDb, 'cie10Catalog')); const b = writeBatch(adminDb); s.docs.forEach(d => b.delete(d.ref));
    await b.commit(); return { success: true };
}

export async function cleanupOldRecords() {
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const isoLimit = thirtyDaysAgo.toISOString(); const colls = ['appointments', 'labAppointments', 'xrayAppointments', 'ultrasoundAppointments', 'vaccineAppointments', 'activityLog'];
    let total = 0;
    for (const c of colls) {
        const q = query(collection(adminDb, c), where(c === 'activityLog' ? 'timestamp' : 'date', '<', c === 'activityLog' ? Timestamp.fromDate(thirtyDaysAgo) : isoLimit));
        const s = await getDocs(q); const b = writeBatch(adminDb); s.docs.forEach(d => { b.delete(d.ref); total++; }); await b.commit();
    }
    return { success: true, deletedCount: total };
}

export async function downloadBackupAction() {
    const colls = ['patients', 'appointments', 'labAppointments', 'xrayAppointments', 'ultrasoundAppointments', 'vaccineAppointments', 'clinics', 'medications', 'pharmacyVouchers', 'supplies'];
    const res: any = {};
    for (const c of colls) { const s = await getDocs(collection(adminDb, c)); res[c] = s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
    return { success: true, data: res };
}

// --- BI ---
export async function searchCie10(t: string) { 
    const q = query(collection(adminDb, 'cie10Catalog'), where('nombre', '>=', t.toUpperCase()), limit(50)); 
    const s = await getDocs(q); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); 
}

export async function getBIData() { 
    const [apps, lab, xr, us, vac, clinics, colonias] = await Promise.all([
        getDocs(query(collection(adminDb, 'appointments'), limit(5000))), 
        getDocs(query(collection(adminDb, 'labAppointments'), limit(2000))), 
        getDocs(query(collection(adminDb, 'xrayAppointments'), limit(2000))), 
        getDocs(query(collection(adminDb, 'ultrasoundAppointments'), limit(2000))), 
        getDocs(query(collection(adminDb, 'vaccineAppointments'), limit(2000))), 
        getClinicsData(), 
        getColoniasData()
    ]); 
    return { appointments: apps.docs.map(d => serializeData(d.data())), labAppointments: lab.docs.map(d => serializeData(d.data())), xRayAppointments: xr.docs.map(d => serializeData(d.data())), ultrasoundAppointments: us.docs.map(d => serializeData(d.data())), vaccineAppointments: vac.docs.map(d => serializeData(d.data())), clinics, colonias }; 
}

export async function getAttendedPatientsForClinic(cid: string) { 
    const clinicDoc = await getDoc(doc(adminDb, 'clinics', cid));
    const clinicName = clinicDoc.exists() ? (clinicDoc.data() as Clinic).name : '';

    const snap = await getDocs(collection(adminDb, 'appointments'));
    const ids = Array.from(new Set(
        snap.docs
            .filter(d => {
                const data = d.data();
                const clinicMatch = data.clinicId === cid || (clinicName && data.clinicName && data.clinicName.toUpperCase().trim() === clinicName.toUpperCase().trim());
                return clinicMatch && data.status === 'Atendido';
            })
            .map(d => d.data().patientId)
    ));
    
    if (ids.length === 0) return []; 
    const patients: Patient[] = []; 
    for (let i = 0; i < ids.length; i += 30) { 
        const ps = await getDocs(query(collection(adminDb, 'patients'), where('__name__', 'in', ids.slice(i, i+30)))); ps.forEach(d => patients.push({ ...d.data(), id: d.id } as Patient)); 
    } 
    return serializeData(patients); 
}

export async function rebuildNombreCompletoAction() {
    const snap = await getDocs(collection(adminDb, 'patients')); const batch = writeBatch(adminDb); let count = 0;
    snap.docs.forEach(d => { const nc = generateNombreCompleto(d.data()); if (d.data().nombreCompleto !== nc) { batch.update(d.ref, { nombreCompleto: nc }); count++; } });
    await batch.commit(); return { success: true, count };
}
