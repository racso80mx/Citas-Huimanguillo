
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
  getCountFromServer,
  DocumentData,
  Query,
  orderBy,
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
  Medication,
  Supply,
  Clinic,
  Colonia,
  ServiceType,
  Specialty,
  Prescription,
  ArchiveCounts,
  Cie10Record
} from './definitions';
import { PatientStatus, BookingMode } from './definitions';
import { v4 as uuidv4 } from 'uuid';
import { startOfDay, subDays } from 'date-fns';

// --- UTILIDADES ---
export function serializeData(data: any): any {
  if (data === null || data === undefined) return data;
  if (data instanceof Timestamp) return data.toDate().toISOString();
  if (data instanceof DocumentReference) return data.id;
  if (Array.isArray(data)) return data.map(serializeData);
  if (typeof data === 'object' && data.constructor === Object) {
    const serialized: any = {};
    for (const key in data) {
      serialized[key] = serializeData(data[key]);
    }
    return serialized;
  }
  return data;
}

// --- MOTOR DE HIDRATACIÓN (Vínculo de Pacientes Infalible) ---
async function hydrateAppointments(appointments: any[]) {
    if (!appointments || appointments.length === 0) return [];
    
    // Cargamos el padrón completo (dentro del límite de 10k) para cruce de datos veloz
    const patientsMap: Record<string, any> = {};
    const patientsSnap = await getDocs(query(collection(adminDb, 'patients'), limit(10000)));
    patientsSnap.forEach(d => {
        const data = d.data();
        patientsMap[d.id] = { ...data, id: d.id };
        if (data.curp) patientsMap[data.curp.toUpperCase()] = { ...data, id: d.id };
    });

    return appointments.map(app => {
        const patientId = String(app.patientId || '').toUpperCase();
        const curpInApp = String(app.patient?.curp || '').toUpperCase();
        
        // Búsqueda por ID, por CURP o por dato embebido
        const pFromPadron = patientsMap[patientId] || patientsMap[curpInApp];
        
        // Fallback robusto: Datos del padrón > Datos embebidos > Objeto genérico
        const finalPatient = pFromPadron || app.patient || { 
            name: 'PACIENTE', 
            paternalLastName: 'DESCONOCIDO', 
            curp: patientId || 'S/C', 
            phoneNumber: 'N/A' 
        };

        return {
            ...serializeData(app),
            patient: serializeData(finalPatient)
        };
    });
}

// --- SEGURIDAD ---
export const DEFAULT_PASSWORDS: Record<string, string> = {
    'superadmin': 'Hu1m4ngu1ll0',
    'medical': 'citas2026',
    'archive': '2026',
    'archiveInquiry': '2026',
    'pharmacy': 'farmacia2026',
    'warehouse': 'almacen2026',
    'bi': 'bi2026',
    'lab': '123',
    'xray': '123',
    'ultrasound': '123',
    'vaccine': '123'
};

async function getPasswordFromStore(id: string, def: string): Promise<string> {
    try {
        const s = await getDoc(doc(adminDb, 'module_passwords', id));
        return s.exists() ? s.data().password : def;
    } catch (e) { return def; }
}

export async function verifyModulePassword(moduleId: string, input: string) {
    const pass = await getPasswordFromStore(moduleId, DEFAULT_PASSWORDS[moduleId] || '123');
    const success = pass === input;
    return { success, message: !success ? 'Contraseña incorrecta.' : undefined };
}

export async function verifyClinicPassword(clinicId: string, input: string) {
    const snap = await getDoc(doc(adminDb, 'clinics', clinicId));
    if (!snap.exists()) return { success: false, message: 'La unidad no existe.' };
    const pass = snap.data().password;
    return { success: pass === input, message: pass !== input ? 'Contraseña incorrecta.' : undefined };
}

// --- PACIENTES (BÚSQUEDA INTELIGENTE SMART-MATCH) ---
export async function getPatientsData(options?: any): Promise<Patient[]> {
    const colRef = collection(adminDb, 'patients');
    
    if (options?.searchCurp) {
        const q = query(colRef, where('curp', '==', options.searchCurp.toUpperCase().trim()), limit(10));
        const s = await getDocs(q);
        return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id })));
    }
    
    if (options?.searchExpediente) {
        const q = query(colRef, where('expediente', '==', options.searchExpediente.trim()), limit(10));
        const s = await getDocs(q);
        return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id })));
    }

    // Búsqueda Inteligente Global: Obtiene universo y filtra en memoria para flexibilidad total
    const snap = await getDocs(query(colRef, limit(10000)));
    let results = snap.docs.map(d => ({ ...d.data(), id: d.id })) as Patient[];

    if (options?.searchName) {
        const terms = options.searchName.toUpperCase().trim().split(' ').filter((t:string) => t.length >= 2);
        results = results.filter(p => {
            const fullName = `${p.name} ${p.paternalLastName} ${p.maternalLastName}`.toUpperCase();
            return terms.every((t:string) => fullName.includes(t));
        });
    }

    if (options?.status && options.status !== 'Total') {
        results = results.filter(p => p.status === options.status);
    }

    return serializeData(results.slice(0, 1000));
}

export async function getPatientCounts(): Promise<ArchiveCounts> {
    const colRef = collection(adminDb, 'patients');
    const [t, v, b, bd] = await Promise.all([
        getCountFromServer(colRef),
        getCountFromServer(query(colRef, where('status', '==', PatientStatus.Vigente))),
        getCountFromServer(query(colRef, where('status', '==', PatientStatus.Baja))),
        getCountFromServer(query(colRef, where('status', '==', PatientStatus.BajaDefinitiva)))
    ]);
    return { total: t.data().count, vigente: v.data().count, bajaTemporal: b.data().count, bajaDefinitiva: bd.data().count };
}

// --- CITAS (Sincronización Total 10,000 Registros) ---
export async function getAppointmentsData() { 
    const snap = await getDocs(query(collection(adminDb, 'appointments'), orderBy('date', 'desc'), limit(10000))); 
    return hydrateAppointments(snap.docs.map(d => d.data()));
}

export async function getAppointmentsForClinic(cid: string) {
    const clinicsSnap = await getDocs(collection(adminDb, 'clinics'));
    const clinic = clinicsSnap.docs.find(d => d.id === cid || d.data().name?.toUpperCase() === cid.toUpperCase());
    
    const snap = await getDocs(query(collection(adminDb, 'appointments'), limit(10000)));
    const filtered = snap.docs.map(d => d.data()).filter(a => 
        a.clinicId === cid || 
        String(a.clinicName || '').toUpperCase() === cid.toUpperCase() ||
        (clinic && a.clinicId === clinic.id)
    );
    return hydrateAppointments(filtered);
}

// --- LOGS ---
export async function getLogsData() {
    const snap = await getDocs(query(collection(adminDb, 'activityLog'), orderBy('timestamp', 'desc'), limit(500)));
    return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id }));
}

export async function logActivity(action: string, details: string) {
    await addDoc(collection(adminDb, 'activityLog'), {
        timestamp: Timestamp.now(),
        action,
        details
    });
    return { success: true };
}

// --- CRUD PACIENTES ---
export async function savePatient(p: Omit<Patient, 'id'>, id: string) { const finalId = id || p.curp; await setDoc(doc(adminDb, 'patients', finalId), { ...p, id: finalId }); return { success: true }; }
export async function updatePatient(id: string, p: Partial<Patient>) { await updateDoc(doc(adminDb, 'patients', id), p); return { success: true }; }
export async function updatePatientStatus(id: string, status: string) { await updateDoc(doc(adminDb, 'patients', id), { status }); return { success: true }; }
export async function deletePatient(id: string) { await deleteDoc(doc(adminDb, 'patients', id)); return { success: true }; }
export async function deletePatients(ids: string[]) { const b = writeBatch(adminDb); ids.forEach(id => b.delete(doc(adminDb, 'patients', id))); await b.commit(); return { success: true }; }
export async function getPatientByCURP(curp: string) { const q = query(collection(adminDb, 'patients'), where('curp', '==', curp.toUpperCase().trim()), limit(1)); const s = await getDocs(q); return s.empty ? { success: false } : { success: true, data: serializeData({ ...s.docs[0].data(), id: s.docs[0].id }) }; }

export async function bulkInsertPatients(patients: any[]) {
    const batch = writeBatch(adminDb);
    let count = 0;
    for (const p of patients) {
        const curp = String(p.CURP || p.curp || '').toUpperCase().trim();
        if (!curp) continue;
        const data = {
            id: curp, curp, name: String(p.Nombre || p.name || '').toUpperCase().trim(),
            paternalLastName: String(p.Apaterno || p.paternalLastName || '').toUpperCase().trim(),
            maternalLastName: String(p.Amaterno || p.maternalLastName || '').toUpperCase().trim(),
            expediente: String(p['No.Expediente'] || p.expediente || '').trim(),
            status: p.Estatus || p.status || PatientStatus.Vigente,
            phoneNumber: String(p.Telefono || p.phoneNumber || '').trim(),
            age: Number(p.Edad || p.age || 0), sex: String(p.Sexo || p.sex || 'Hombre'),
            birthDate: String(p.FNacimiento || p.birthDate || ''), address: String(p.Domicilio || p.address || ''),
            coloniaName: String(p.Colonia || p.coloniaName || '')
        };
        batch.set(doc(adminDb, 'patients', curp), data, { merge: true });
        count++;
    }
    await batch.commit();
    return { success: true, processedCount: count };
}

// --- CRUD CITAS ---
export async function saveNewAppointment(a: any, p: any, isD: boolean, c?: string) { 
    const id = uuidv4(); 
    const data = { ...a, id, appointmentNumber: `CITA-${uuidv4().split('-')[0].toUpperCase()}`, patientId: p.curp, patient: p, coloniaName: c, createdAt: new Date().toISOString() };
    await setDoc(doc(adminDb, 'appointments', id), data); 
    await setDoc(doc(adminDb, 'patients', p.curp), { ...p, id: p.curp }, { merge: true }); 
    return { success: true, data: serializeData(data) }; 
}

export async function deleteAppointment(id: string) { await deleteDoc(doc(adminDb, 'appointments', id)); return { success: true }; }
export async function deleteLabAppointment(id: string) { await deleteDoc(doc(adminDb, 'labAppointments', id)); return { success: true }; }
export async function deleteXRayAppointment(id: string) { await deleteDoc(doc(adminDb, 'xrayAppointments', id)); return { success: true }; }
export async function deleteUltrasoundAppointment(id: string) { await deleteDoc(doc(adminDb, 'ultrasoundAppointments', id)); return { success: true }; }
export async function deleteVaccineAppointment(id: string) { await deleteDoc(doc(adminDb, 'vaccineAppointments', id)); return { success: true }; }

export async function rescheduleAppointment(id: string, d: string, t: any) {
    const coll = t === 'lab' ? 'labAppointments' : t === 'xray' ? 'xrayAppointments' : t === 'ultrasound' ? 'ultrasoundAppointments' : t === 'vaccine' ? 'vaccineAppointments' : 'appointments';
    await updateDoc(doc(adminDb, coll, id), { date: d });
    return { success: true, message: 'Fecha actualizada correctamente.' };
}

export async function cloneAppointment(id: string, d: string, t: any, ti?: string) {
    const coll = t === 'lab' ? 'labAppointments' : t === 'xray' ? 'xrayAppointments' : t === 'ultrasound' ? 'ultrasoundAppointments' : t === 'vaccine' ? 'vaccineAppointments' : 'appointments';
    const snap = await getDoc(doc(adminDb, coll, id));
    if (!snap.exists()) return { success: false, message: 'Cita no encontrada.' };
    const data = snap.data();
    const newId = uuidv4();
    const newData = { ...data, id: newId, date: d, time: ti || data.time, appointmentNumber: `${data.appointmentNumber}-BIS`, createdAt: new Date().toISOString(), status: 'Agendada' };
    await setDoc(doc(adminDb, coll, newId), newData);
    return { success: true, message: 'Nueva cita asignada.' };
}

export async function updateAppointmentStatus(id: string, s: string, t: any) {
    const coll = t === 'lab' ? 'labAppointments' : t === 'xray' ? 'xrayAppointments' : t === 'ultrasound' ? 'ultrasoundAppointments' : t === 'vaccine' ? 'vaccineAppointments' : 'appointments';
    await updateDoc(doc(adminDb, coll, id), { status: s });
    return { success: true };
}

// --- CLÍNICAS ---
export async function updateClinics(clinics: Clinic[]) {
    const batch = writeBatch(adminDb);
    clinics.forEach(c => batch.set(doc(adminDb, 'clinics', c.id), c));
    await batch.commit();
    return { success: true };
}
export async function deleteClinic(id: string) { await deleteDoc(doc(adminDb, 'clinics', id)); return { success: true }; }

// --- CONFIGURACIONES ---
export async function getModuleSettings(): Promise<ModuleSettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'moduleSettings'));
    const def = { citasMedicasEnabled: true, laboratorioEnabled: true, rayosXEnabled: true, ultrasoundEnabled: true, vacunasEnabled: true, archivoEnabled: true, farmaciaEnabled: true, almacenEnabled: true, archivoConsultaEnabled: true, citasMedicasWhatsAppEnabled: true, laboratorioWhatsAppEnabled: true, rayosXWhatsAppEnabled: true, ultrasoundWhatsAppEnabled: true, vacunasWhatsAppEnabled: true, archivoWhatsAppEnabled: true, citasMedicasPassword: DEFAULT_PASSWORDS.medical, archivoConsultaPassword: DEFAULT_PASSWORDS.archiveInquiry };
    return s.exists() ? serializeData(s.data()) as ModuleSettings : def;
}
export async function updateModuleSettings(s: ModuleSettings) { await setDoc(doc(adminDb, 'settings', 'moduleSettings'), s); return { success: true }; }
export async function getAdminSettingsData() { const p = await getPasswordFromStore('superadmin', DEFAULT_PASSWORDS.superadmin); return { password: p }; }
export async function updateAdminSettings(s: any) { await setDoc(doc(adminDb, 'module_passwords', 'superadmin'), { password: s.password }); return { success: true }; }
export async function getArchiveSettings() { const p = await getPasswordFromStore('archive', DEFAULT_PASSWORDS.archive); return { password: p }; }
export async function updateArchiveSettings(s: any) { await setDoc(doc(adminDb, 'module_passwords', 'archive'), { password: s.password }); return { success: true }; }
export async function getPharmacySettings() { const p = await getPasswordFromStore('pharmacy', DEFAULT_PASSWORDS.pharmacy); return { password: p }; }
export async function updatePharmacySettings(s: any) { await setDoc(doc(adminDb, 'module_passwords', 'pharmacy'), { password: s.password }); return { success: true }; }
export async function getWarehouseSettings() { const p = await getPasswordFromStore('warehouse', DEFAULT_PASSWORDS.warehouse); return { password: p }; }
export async function updateWarehouseSettings(s: any) { await setDoc(doc(adminDb, 'module_passwords', 'warehouse'), { password: s.password }); return { success: true }; }
export async function getBISettings() { const p = await getPasswordFromStore('bi', DEFAULT_PASSWORDS.bi); return { password: p }; }
export async function updateBISettings(s: any) { await setDoc(doc(adminDb, 'module_passwords', 'bi'), { password: s.password }); return { success: true }; }

// --- CATÁLOGOS ---
export async function getAnnouncementsData() { const snap = await getDoc(doc(adminDb, 'settings', 'announcements')); return snap.exists() ? snap.data().messages : []; }
export async function updateAnnouncements(m: string[]) { await setDoc(doc(adminDb, 'settings', 'announcements'), { messages: m }); return { success: true }; }
export async function getHolidaysData() { const snap = await getDocs(collection(adminDb, 'holidays')); return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateHolidays(h: Holiday[]) { const b = writeBatch(adminDb); h.forEach(x => b.set(doc(adminDb, 'holidays', x.date), x)); await b.commit(); return { success: true }; }
export async function getSpecialActionDaysData() { const snap = await getDocs(collection(adminDb, 'specialActionDays')); return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateSpecialActionDays(i: SpecialActionDay[]) { const b = writeBatch(adminDb); i.forEach(x => b.set(doc(adminDb, 'specialActionDays', x.date + '_' + x.clinicType), x)); await b.commit(); return { success: true }; }
export async function getSpecialtiesData() { const snap = await getDocs(collection(adminDb, 'specialties')); return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateSpecialties(t: any[]) { const b = writeBatch(adminDb); t.forEach(x => b.set(doc(adminDb, 'specialties', x.id), x)); await b.commit(); return { success: true }; }
export async function getColoniasData() { const snap = await getDocs(collection(adminDb, 'colonias')); return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateColonias(c: Colonia[]) { const b = writeBatch(adminDb); c.forEach(x => b.set(doc(adminDb, 'colonias', x.id), x)); await b.commit(); return { success: true }; }

export async function getLabSettings() { const s = await getDoc(doc(adminDb, 'settings', 'labSettings')); return s.exists() ? serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 0, weekendBookingEnabled: false, startTime: '08:00', endTime: '13:00' }; }
export async function updateLabSettings(s: any) { await setDoc(doc(adminDb, 'settings', 'labSettings'), s); return { success: true }; }
export async function getXRaySettings() { const s = await getDoc(doc(adminDb, 'settings', 'xraySettings')); return s.exists() ? serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 0, weekendBookingEnabled: false, startTime: '08:00', endTime: '13:00' }; }
export async function updateXRaySettings(s: any) { await setDoc(doc(adminDb, 'settings', 'xraySettings'), s); return { success: true }; }
export async function getUltrasoundSettings() { const s = await getDoc(doc(adminDb, 'settings', 'ultrasoundSettings')); return s.exists() ? serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 0, weekendBookingEnabled: false, startTime: '08:00', endTime: '13:00' }; }
export async function updateUltrasoundSettings(s: any) { await setDoc(doc(adminDb, 'settings', 'ultrasoundSettings'), s); return { success: true }; }
export async function getVaccineSettings() { const s = await getDoc(doc(adminDb, 'settings', 'vaccineSettings')); return s.exists() ? serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 0, weekendBookingEnabled: false, startTime: '08:00', endTime: '13:00' }; }
export async function updateVaccineSettings(s: any) { await setDoc(doc(adminDb, 'settings', 'vaccineSettings'), s); return { success: true }; }

export async function getLabStudies() { const s = await getDocs(collection(adminDb, 'labStudies')); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateLabStudies(s: any[]) { const b = writeBatch(adminDb); s.forEach(x => b.set(doc(adminDb, 'labStudies', x.id), x)); await b.commit(); return { success: true }; }
export async function getXRayStudies() { const s = await getDocs(collection(adminDb, 'xrayStudies')); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateXRayStudies(s: any[]) { const b = writeBatch(adminDb); s.forEach(x => b.set(doc(adminDb, 'xrayStudies', x.id), x)); await b.commit(); return { success: true }; }
export async function getUltrasoundStudies() { const s = await getDocs(collection(adminDb, 'ultrasoundStudies')); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateUltrasoundStudies(s: any[]) { const b = writeBatch(adminDb); s.forEach(x => b.set(doc(adminDb, 'ultrasoundStudies', x.id), x)); await b.commit(); return { success: true }; }
export async function getVaccines() { const s = await getDocs(collection(adminDb, 'vaccines')); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateVaccines(s: any[]) { const b = writeBatch(adminDb); s.forEach(x => b.set(doc(adminDb, 'vaccines', x.id), x)); await b.commit(); return { success: true }; }

export async function getLabAppointmentsData() { const snap = await getDocs(query(collection(adminDb, 'labAppointments'), orderBy('date', 'desc'), limit(10000))); return hydrateAppointments(snap.docs.map(d => d.data())); }
export async function getXRayAppointmentsData() { const snap = await getDocs(query(collection(adminDb, 'xrayAppointments'), orderBy('date', 'desc'), limit(10000))); return hydrateAppointments(snap.docs.map(d => d.data())); }
export async function getUltrasoundAppointmentsData() { const snap = await getDocs(query(collection(adminDb, 'ultrasoundAppointments'), orderBy('date', 'desc'), limit(10000))); return hydrateAppointments(snap.docs.map(d => d.data())); }
export async function getVaccineAppointmentsData() { const snap = await getDocs(query(collection(adminDb, 'vaccineAppointments'), orderBy('date', 'desc'), limit(10000))); return hydrateAppointments(snap.docs.map(d => d.data())); }

// --- FARMACIA Y ALMACÉN ---
export async function getMedications() { const s = await getDocs(query(collection(adminDb, 'medications'), limit(10000))); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function getSupplies() { const s = await getDocs(query(collection(adminDb, 'supplies'), limit(10000))); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }

export async function bulkInsertMedications(items: any[]) {
    const batch = writeBatch(adminDb);
    let count = 0;
    items.forEach(i => {
        const id = String(i.claveCuadroBasico || i.id || uuidv4()).replace(/\//g, '-');
        batch.set(doc(adminDb, 'medications', id), { ...i, id, existence: Number(i.existencia || i.existence || 0) }, { merge: true });
        count++;
    });
    await batch.commit();
    return { success: true, processedCount: count };
}

export async function bulkInsertSupplies(items: any[]) {
    const batch = writeBatch(adminDb);
    let count = 0;
    items.forEach(i => {
        const id = String(i.claveCuadroBasico || i.id || uuidv4()).replace(/\//g, '-');
        batch.set(doc(adminDb, 'supplies', id), { ...i, id, existence: Number(i.existencia || i.existence || 0) }, { merge: true });
        count++;
    });
    await batch.commit();
    return { success: true, processedCount: count };
}

export async function deleteAllMedications() { const s = await getDocs(collection(adminDb, 'medications')); const b = writeBatch(adminDb); s.docs.forEach(d => b.delete(d.ref)); await b.commit(); return { success: true }; }
export async function deleteAllSupplies() { const s = await getDocs(collection(adminDb, 'supplies')); const b = writeBatch(adminDb); s.docs.forEach(d => b.delete(d.ref)); await b.commit(); return { success: true }; }

// --- CONSULTAS Y RECETAS ---
export async function getConsultationsByPatientId(pid: string) { const s = await getDocs(query(collection(adminDb, 'medicalConsultations'), where('patientId', '==', pid), limit(100))); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function getPrescriptionsByPatientId(pid: string) { const s = await getDocs(query(collection(adminDb, 'prescriptions'), where('patientId', '==', pid), limit(50))); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function createPrescription(p: any) { const id = uuidv4(); const folio = `REC-${uuidv4().split('-')[0].toUpperCase()}`; await setDoc(doc(adminDb, 'prescriptions', id), { ...p, id, folio, status: 'pendiente', createdAt: new Date().toISOString() }); return { success: true, folio, prescription: { ...p, id, folio } }; }
export async function updatePrescription(id: string, p: any) { await updateDoc(doc(adminDb, 'prescriptions', id), p); return { success: true }; }
export async function deletePrescription(id: string) { await deleteDoc(doc(adminDb, 'prescriptions', id)); return { success: true }; }
export async function dispensePrescription(id: string, items: any[]) { 
    const b = writeBatch(adminDb);
    for (const i of items) {
        const ref = doc(adminDb, 'medications', i.medicationId);
        b.update(ref, { existencia: increment(-i.quantity) });
    }
    b.update(doc(adminDb, 'prescriptions', id), { status: 'surtida', dispensedAt: new Date().toISOString() });
    await b.commit();
    return { success: true };
}

export async function getPendingPrescriptions(filters: any) {
    let q = query(collection(adminDb, 'prescriptions'), where('status', '==', 'pendiente'), limit(100));
    const snap = await getDocs(q);
    let results = snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id }));
    if (filters?.folio) results = results.filter(r => r.folio.includes(filters.folio.toUpperCase()));
    return results;
}

export async function getPrescriptionHistory(f: any) {
    let q = query(collection(adminDb, 'prescriptions'), where('status', '==', 'surtida'), orderBy('date', 'desc'), limit(500));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id }));
}

export async function saveMedicalConsultation(c: any) {
    const id = c.id || uuidv4();
    await setDoc(doc(adminDb, 'medicalConsultations', id), { ...c, id, createdAt: new Date().toISOString() });
    if (c.isFinal) await updateDoc(doc(adminDb, 'appointments', c.appointmentId), { status: 'Atendido' });
    return { success: true, id };
}

export async function deleteMedicalConsultation(id: string) { await deleteDoc(doc(adminDb, 'medicalConsultations', id)); return { success: true }; }
export async function getConsultationByAppointmentId(aid: string) { const q = query(collection(adminDb, 'medicalConsultations'), where('appointmentId', '==', aid), limit(1)); const s = await getDocs(q); return s.empty ? null : serializeData({ ...s.docs[0].data(), id: s.docs[0].id }); }

export async function searchCie10(t: string) {
    const s = await getDocs(query(collection(adminDb, 'cie10Catalog'), where('nombre', '>=', t.toUpperCase()), limit(20)));
    return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id }));
}

export async function getAttendedPatientsForClinic(cid: string) {
    const s = await getDocs(query(collection(adminDb, 'appointments'), where('clinicId', '==', cid), where('status', '==', 'Atendido'), limit(1000)));
    return s.docs.map(d => ({ ...serializeData(d.data().patient), id: d.data().patientId }));
}

export async function getAvailableSlotsForDate(cid: string, d: string) {
    const clinicDoc = await getDoc(doc(adminDb, 'clinics', cid));
    if (!clinicDoc.exists()) return { timeSlots: [], tokens: [] };
    const clinic = clinicDoc.data() as Clinic;
    const dOnly = d.split('T')[0];
    const snap = await getDocs(query(collection(adminDb, 'appointments'), where('clinicId', '==', cid), limit(500)));
    const booked = snap.docs.filter(doc => doc.data().date.startsWith(dOnly)).map(doc => doc.data().time);
    
    if (clinic.bookingMode === BookingMode.Token) {
        const total = (clinic.dailySlots || 15) + (clinic.waitlistSlots || 0);
        return { tokens: Array.from({ length: total }, (_, i) => i + 1).filter(t => !booked.includes(`Ficha ${t}`)) };
    }
    return { timeSlots: [] }; 
}

export async function getAppointmentCountOnDate(cid: string, d: string) {
    const dOnly = d.split('T')[0];
    const snap = await getCountFromServer(query(collection(adminDb, 'appointments'), where('clinicId', '==', cid), where('date', '>=', dOnly), where('date', '<=', dOnly + 'T23:59:59')));
    return snap.data().count;
}

export async function cleanupOldRecords() {
    const b = writeBatch(adminDb);
    const snap = await getDocs(query(collection(adminDb, 'appointments'), where('date', '<', subDays(new Date(), 30).toISOString()), limit(500)));
    snap.docs.forEach(d => b.delete(d.ref));
    await b.commit();
    return { success: true, deletedCount: snap.size };
}

export async function normalizeExpedientesAction() {
    const snap = await getDocs(collection(adminDb, 'patients'));
    const batch = writeBatch(adminDb);
    let count = 0;
    snap.docs.forEach(d => {
        const data = d.data();
        if (data.expediente && !data.expediente.startsWith('0')) {
            batch.update(d.ref, { expediente: '0' + data.expediente });
            count++;
        }
    });
    await batch.commit();
    return { success: true, count };
}

export async function scanDuplicates(criteria: string) {
    const snap = await getDocs(collection(adminDb, 'patients'));
    const all = snap.docs.map(d => ({ ...d.data(), id: d.id })) as Patient[];
    const groups: Record<string, Patient[]> = {};
    all.forEach(p => {
        const key = criteria === 'curp' ? p.curp : criteria === 'expediente' ? p.expediente : `${p.name}_${p.paternalLastName}`;
        if (!key) return;
        if (!groups[key]) groups[key] = [];
        groups[key].push(p);
    });
    return Object.values(groups).filter(g => g.length > 1);
}

export async function applyStatusUpdateChunk(expedientes: string[], status: string) {
    const snap = await getDocs(collection(adminDb, 'patients'));
    const batch = writeBatch(adminDb);
    let count = 0;
    snap.docs.forEach(d => {
        const data = d.data();
        if (expedientes.includes(data.expediente) || expedientes.includes(String(Number(data.expediente)))) {
            batch.update(d.ref, { status });
            count++;
        }
    });
    await batch.commit();
    return { success: true, count };
}

export async function getPatientPrescriptionsCountTodayAction(pid: string) {
    const today = startOfDay(new Date()).toISOString();
    const q = query(collection(adminDb, 'prescriptions'), where('patientId', '==', pid), where('date', '>=', today));
    const s = await getDocs(q);
    return s.size;
}

export async function bulkInsertCie10Glossary(data: any[]) {
    const b = writeBatch(adminDb);
    data.forEach(d => b.set(doc(adminDb, 'cie10Glossary', uuidv4()), d));
    await b.commit();
    return { success: true, processedCount: data.length };
}

export async function bulkInsertCie10Catalog(data: any[]) {
    const b = writeBatch(adminDb);
    data.forEach(d => {
        const id = d.catalogKey || uuidv4();
        b.set(doc(adminDb, 'cie10Catalog', id), d);
    });
    await b.commit();
    return { success: true, processedCount: data.length };
}

export async function deleteAllCie10Glossary() { const s = await getDocs(collection(adminDb, 'cie10Glossary')); const b = writeBatch(adminDb); s.docs.forEach(d => b.delete(d.ref)); await b.commit(); return { success: true }; }
export async function deleteAllCie10Catalog() { const s = await getDocs(collection(adminDb, 'cie10Catalog')); const b = writeBatch(adminDb); s.docs.forEach(d => b.delete(d.ref)); await b.commit(); return { success: true }; }
