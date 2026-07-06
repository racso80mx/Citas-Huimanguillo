
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
  orderBy
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
  Cie10Record
} from './definitions';
import { PatientStatus, BookingMode } from './definitions';
import { v4 as uuidv4 } from 'uuid';
import { startOfDay, subDays } from 'date-fns';

/**
 * MOTOR DE SERIALIZACIÓN ROBUSTO
 * Convierte Timestamps y objetos complejos a tipos primitivos seguros de forma recursiva.
 */
export function serializeData(data: any): any {
  if (data === null || data === undefined) return '';
  
  // Detección de Timestamps de Firestore o fechas
  if (typeof data.toDate === 'function') {
    return data.toDate().toISOString();
  }
  
  if (data && typeof data === 'object' && 'seconds' in data && 'nanoseconds' in data) {
    return new Date(data.seconds * 1000).toISOString();
  }

  if (data instanceof DocumentReference) {
    return data.id;
  }

  if (Array.isArray(data)) {
    return data.map(serializeData);
  }

  if (typeof data === 'object' && data.constructor === Object) {
    const o: any = {};
    for (const key in data) {
      o[key] = serializeData(data[key]);
    }
    return o;
  }

  return data;
}

/**
 * HIDRATACIÓN DE CITAS
 * Vincula citas con pacientes de forma robusta.
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
            const q = query(collection(adminDb, 'patients'), where('__name__', 'in', chunk));
            const snap = await getDocs(q);
            snap.forEach(d => {
                patientsMap[d.id] = { ...d.data(), id: d.id };
            });
        }
    }

    return appointments.map(app => {
        const pid = typeof app.patientId === 'object' ? app.patientId?.id : app.patientId;
        const patientData = patientsMap[pid] || app.patient || { 
            name: 'PACIENTE', 
            paternalLastName: 'N/A', 
            maternalLastName: '',
            curp: pid || 'S/C', 
            phoneNumber: '---' 
        };
        
        return {
            ...app,
            patientId: pid,
            patient: serializeData(patientData)
        };
    });
}

// --- LOGS ---
export async function logActivity(action: string, details: string) {
    await addDoc(collection(adminDb, 'activityLog'), { 
        timestamp: Timestamp.now(), 
        action, 
        details 
    });
    return { success: true };
}

export async function getLogsData() {
    const snap = await getDocs(query(collection(adminDb, 'activityLog'), limit(500)));
    let logs = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    logs.sort((a: any, b: any) => {
        const tA = a.timestamp?.seconds || 0;
        const tB = b.timestamp?.seconds || 0;
        return tB - tA;
    });
    return serializeData(logs);
}

// --- MÓDULOS ---
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
        archivoWhatsAppEnabled: true,
        citasMedicasPassword: '123',
        archivoConsultaPassword: '123'
    };
}

export async function updateModuleSettings(s: ModuleSettings) {
    await setDoc(doc(adminDb, 'settings', 'moduleSettings'), s, { merge: true });
    return { success: true };
}

export async function verifyModulePassword(module: string, password: string) {
    let docId = 'adminSettings';
    if (module === 'archive') docId = 'archiveSettings';
    if (module === 'pharmacy') docId = 'pharmacySettings';
    if (module === 'warehouse') docId = 'warehouseSettings';
    if (module === 'bi') docId = 'biSettings';
    
    if (['lab', 'xray', 'ultrasound', 'vaccine'].includes(module)) {
        const snap = await getDoc(doc(adminDb, 'settings', `${module}Settings`));
        return { success: snap.data()?.password === password };
    }
    
    if (module === 'medical') {
        const mod = await getDoc(doc(adminDb, 'settings', 'moduleSettings'));
        return { success: mod.data()?.citasMedicasPassword === password };
    }
    
    if (module === 'superadmin') {
        const sa = await getDoc(doc(adminDb, 'settings', 'adminSettings'));
        return { success: sa.data()?.password === password };
    }

    const snap = await getDoc(doc(adminDb, 'settings', docId));
    return { success: snap.data()?.password === password };
}

export async function verifyClinicPassword(id: string, password: string) {
    const snap = await getDoc(doc(adminDb, 'clinics', id));
    if (snap.exists() && snap.data().password === password) {
        return { success: true };
    }
    return { success: false, message: 'Contraseña de unidad incorrecta.' };
}

// --- PACIENTES (BÚSQUEDA INTELIGENTE SMART-MATCH) ---
export async function getPatientsData(options?: any): Promise<Patient[]> {
    const colRef = collection(adminDb, 'patients');
    
    // 1. PRIORIDAD: Búsqueda exacta por CURP
    if (options?.searchCurp) {
        const s = await getDocs(query(colRef, where('curp', '==', options.searchCurp.toUpperCase().trim()), limit(1)));
        return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id })));
    }
    
    // 2. PRIORIDAD: Búsqueda exacta por Expediente
    if (options?.searchExpediente) {
        const term = options.searchExpediente.trim();
        const s = await getDocs(query(colRef, where('expediente', 'in', [term, '0' + term]), limit(20)));
        if (!s.empty) return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id })));
    }

    // 3. CONSULTA GENERAL (Con límite amplio para evitar puntos ciegos)
    const snap = await getDocs(query(colRef, limit(10000)));
    let results = snap.docs.map(d => ({ ...d.data(), id: d.id } as Patient));

    // 4. FILTRO DE ESTATUS (Se hace en memoria para evitar errores de índice de Firebase)
    if (options?.status && options.status !== 'Total') {
        results = results.filter(p => p.status === options.status);
    }

    // 5. BÚSQUEDA POR NOMBRE (Smart-Match multi-campo)
    if (options?.searchName) {
        const term = options.searchName.toUpperCase().trim();
        const words = term.split(/\s+/).filter(w => w.length >= 2);
        
        results = results.filter(p => {
            const fullName = `${p.name} ${p.paternalLastName} ${p.maternalLastName}`.toUpperCase();
            return words.every(word => fullName.includes(word));
        });
    }

    // 6. ORDENACIÓN EN MEMORIA (Elimina permanentemente el FirebaseError de Índices)
    results.sort((a, b) => String(a.paternalLastName || '').localeCompare(String(b.paternalLastName || '')));
    
    return serializeData(results.slice(0, 500));
}

export async function getPatientByCURP(curp: string) {
    const snap = await getDoc(doc(adminDb, 'patients', curp.toUpperCase().trim()));
    if (snap.exists()) {
        return { success: true, data: serializeData({ ...snap.data(), id: snap.id }) };
    }
    return { success: false };
}

export async function savePatient(p: Omit<Patient, 'id'>, id: string) {
    const finalId = id || p.curp.toUpperCase().trim();
    await setDoc(doc(adminDb, 'patients', finalId), { ...p, id: finalId }, { merge: true });
    return { success: true };
}

export async function updatePatient(id: string, p: Partial<Patient>) {
    await updateDoc(doc(adminDb, 'patients', id), p);
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

export async function getPatientCounts(): Promise<ArchiveCounts> {
    const colRef = collection(adminDb, 'patients');
    const [total, v, bt, bd] = await Promise.all([
        getCountFromServer(colRef),
        getCountFromServer(query(colRef, where('status', '==', PatientStatus.Vigente))),
        getCountFromServer(query(colRef, where('status', '==', PatientStatus.Baja))),
        getCountFromServer(query(colRef, where('status', '==', PatientStatus.BajaDefinitiva)))
    ]);
    return {
        total: total.data().count,
        vigente: v.data().count,
        bajaTemporal: bt.data().count,
        bajaDefinitiva: bd.data().count
    };
}

export async function bulkInsertPatients(patients: any[]) {
    const batch = writeBatch(adminDb);
    for (const p of patients) {
        const curp = String(p.CURP || p.curp || '').toUpperCase().trim();
        if (!curp) continue;
        const ref = doc(adminDb, 'patients', curp);
        const mapped = {
            id: curp, curp,
            name: String(p.Nombre || p.name || '').toUpperCase().trim(),
            paternalLastName: String(p.Apaterno || p.paternalLastName || '').toUpperCase().trim(),
            maternalLastName: String(p.Amaterno || p.maternalLastName || '').toUpperCase().trim(),
            expediente: String(p['No.Expediente'] || p.expediente || '').trim(),
            birthDate: String(p.FNacimiento || p.birthDate || '').trim(),
            sex: String(p.Sexo || p.sex || 'H').startsWith('H') ? 'Hombre' : 'Mujer',
            age: Number(p.Edad || p.age || 0),
            phoneNumber: String(p.Telefono || p.phoneNumber || '').trim(),
            status: p.Estatus || p.status || PatientStatus.Vigente,
            address: String(p.Domicilio || p.address || '').toUpperCase().trim(),
            coloniaName: String(p.Colonia || p.coloniaName || '').toUpperCase().trim(),
            registrationDate: String(p.FechaApertura || p.registrationDate || '').trim(),
            derechoAbiencia: String(p.DerechoAbiencia || p.derechoAbiencia || '').toUpperCase().trim(),
        };
        batch.set(ref, mapped, { merge: true });
    }
    await batch.commit();
    return { success: true, processedCount: patients.length };
}

// --- CITAS ---
export async function getAppointmentsData() { 
    const snap = await getDocs(query(collection(adminDb, 'appointments'), limit(10000))); 
    let apps = snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id }));
    apps.sort((a: any, b: any) => String(b.date || '').localeCompare(String(a.date || '')));
    return hydrateAppointments(apps);
}

export async function getLabAppointmentsData() {
    const s = await getDocs(query(collection(adminDb, 'labAppointments'), limit(10000)));
    let apps = s.docs.map(d => ({ ...serializeData(d.data()), id: d.id }));
    apps.sort((a: any, b: any) => String(b.date || '').localeCompare(String(a.date || '')));
    return hydrateAppointments(apps);
}

export async function getXRayAppointmentsData() {
    const s = await getDocs(query(collection(adminDb, 'xrayAppointments'), limit(10000)));
    let apps = s.docs.map(d => ({ ...serializeData(d.data()), id: d.id }));
    apps.sort((a: any, b: any) => String(b.date || '').localeCompare(String(a.date || '')));
    return hydrateAppointments(apps);
}

export async function getUltrasoundAppointmentsData() {
    const s = await getDocs(query(collection(adminDb, 'ultrasoundAppointments'), limit(10000)));
    let apps = s.docs.map(d => ({ ...serializeData(d.data()), id: d.id }));
    apps.sort((a: any, b: any) => String(b.date || '').localeCompare(String(a.date || '')));
    return hydrateAppointments(apps);
}

export async function getVaccineAppointmentsData() {
    const s = await getDocs(query(collection(adminDb, 'vaccineAppointments'), limit(10000)));
    let apps = s.docs.map(d => ({ ...serializeData(d.data()), id: d.id }));
    apps.sort((a: any, b: any) => String(b.date || '').localeCompare(String(a.date || '')));
    return hydrateAppointments(apps);
}

export async function saveNewAppointment(appointment: any, patient: any, isDouble: boolean, colonia?: string) {
    const patientRef = doc(adminDb, 'patients', patient.curp);
    await setDoc(patientRef, { ...patient, id: patient.curp }, { merge: true });
    
    const id = uuidv4();
    const appointmentNumber = `MED-${uuidv4().split('-')[0].toUpperCase()}`;
    const fullAppointment = {
        ...appointment,
        id, appointmentNumber,
        patientId: patient.curp,
        patient: serializeData(patient),
        coloniaName: colonia || null,
        createdAt: new Date().toISOString(),
        isDoubleSlot: isDouble
    };
    await setDoc(doc(adminDb, 'appointments', id), fullAppointment);
    const clinicSnap = await getDoc(doc(adminDb, 'clinics', appointment.clinicId));
    return { success: true, data: { appointment: fullAppointment, clinic: clinicSnap.exists() ? serializeData(clinicSnap.data()) : null } };
}

export async function getAppointmentsForClinic(cid: string) {
    const snap = await getDocs(query(collection(adminDb, 'appointments'), where('clinicId', '==', cid), limit(10000)));
    let apps = snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id }));
    apps.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    return hydrateAppointments(apps);
}

export async function updateAppointmentStatus(id: string, s: string, t: any) {
    const cols: any = { lab: 'labAppointments', xray: 'xrayAppointments', ultrasound: 'ultrasoundAppointments', vaccine: 'vaccineAppointments' };
    const colName = cols[t] || 'appointments';
    await updateDoc(doc(adminDb, colName, id), { status: s });
    return { success: true };
}

export async function rescheduleAppointment(id: string, date: string, type: string) {
    const cols: any = { lab: 'labAppointments', xray: 'xrayAppointments', ultrasound: 'ultrasoundAppointments', vaccine: 'vaccineAppointments' };
    const colName = cols[type] || 'appointments';
    await updateDoc(doc(adminDb, colName, id), { date });
    return { success: true, message: 'Cita reprogramada.' };
}

export async function cloneAppointment(id: string, date: string, type: string, time?: string) {
    const cols: any = { lab: 'labAppointments', xray: 'xrayAppointments', ultrasound: 'ultrasoundAppointments', vaccine: 'vaccineAppointments' };
    const colName = cols[type] || 'appointments';
    const snap = await getDoc(doc(adminDb, colName, id));
    if (!snap.exists()) return { success: false };
    const data = snap.data();
    const newId = uuidv4();
    const prefix = data.appointmentNumber?.split('-')[0] || 'APP';
    const newFolio = `${prefix}-${uuidv4().split('-')[0].toUpperCase()}`;
    await setDoc(doc(adminDb, colName, newId), { 
        ...data, id: newId, appointmentNumber: newFolio, date, time: time || data.time, status: 'Agendada', createdAt: new Date().toISOString() 
    });
    return { success: true, message: 'Nueva cita asignada correctamente.' };
}

export async function deleteAppointment(id: string) { await deleteDoc(doc(adminDb, 'appointments', id)); return { success: true }; }
export async function deleteLabAppointment(id: string) { await deleteDoc(doc(adminDb, 'labAppointments', id)); return { success: true }; }
export async function deleteXRayAppointment(id: string) { await deleteDoc(doc(adminDb, 'xrayAppointments', id)); return { success: true }; }
export async function deleteUltrasoundAppointment(id: string) { await deleteDoc(doc(adminDb, 'ultrasoundAppointments', id)); return { success: true }; }
export async function deleteVaccineAppointment(id: string) { await deleteDoc(doc(adminDb, 'vaccineAppointments', id)); return { success: true }; }

// --- CLÍNICAS ---
export async function getClinicsData() { 
    const s = await getDocs(collection(adminDb, 'clinics')); 
    const results = s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); 
    return results.sort((a,b) => String(a.name || '').localeCompare(String(b.name || '')));
}

export async function updateClinics(clinics: Clinic[]) { 
    const b = writeBatch(adminDb);
    for (const x of clinics) {
        const ref = doc(adminDb, 'clinics', x.id);
        const current = await getDoc(ref);
        const baseData = current.exists() ? current.data() : {};
        
        const mappedData: any = { 
            ...baseData,
            ...x 
        };
        Object.keys(mappedData).forEach(key => mappedData[key] === undefined && delete mappedData[key]);
        b.set(ref, mappedData, { merge: true });
    }
    await b.commit();
    return { success: true };
}

export async function deleteClinic(id: string) { await deleteDoc(doc(adminDb, 'clinics', id)); return { success: true }; }

// --- CONSULTAS Y RECETAS ---
export async function getConsultationsByPatientId(pid: string) {
    const s = await getDocs(query(collection(adminDb, 'medicalConsultations'), where('patientId', '==', pid)));
    let results = s.docs.map(d => ({ ...serializeData(d.data()), id: d.id }));
    results.sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)));
    return results;
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

export async function createPrescription(p: any) { 
    const id = uuidv4(); 
    const folio = `REC-${uuidv4().split('-')[0].toUpperCase()}`; 
    const exp = new Date(); exp.setHours(exp.getHours() + 24);
    await setDoc(doc(adminDb, 'prescriptions', id), { 
        ...p, id, folio, status: 'pendiente', 
        createdAt: new Date().toISOString(), 
        expiresAt: exp.toISOString() 
    }); 
    return { success: true, folio, prescription: { ...p, id, folio, status: 'pendiente' } }; 
}

export async function getPrescriptionsByPatientId(pid: string) { 
    const s = await getDocs(query(collection(adminDb, 'prescriptions'), where('patientId', '==', pid))); 
    return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); 
}

export async function updatePrescription(id: string, p: any) { await updateDoc(doc(adminDb, 'prescriptions', id), p); return { success: true }; }
export async function deletePrescription(id: string) { await deleteDoc(doc(adminDb, 'prescriptions', id)); return { success: true }; }

export async function dispensePrescription(id: string, items: any[]) { 
    const b = writeBatch(adminDb);
    items.forEach(i => b.update(doc(adminDb, 'medications', i.medicationId), { existencia: increment(-i.quantity) }));
    b.update(doc(adminDb, 'prescriptions', id), { status: 'surtida', dispensedAt: new Date().toISOString() });
    await b.commit();
    return { success: true };
}

export async function getPendingPrescriptions(filters: any) {
    const snap = await getDocs(query(collection(adminDb, 'prescriptions'), where('status', '==', 'pendiente'), limit(500)));
    let results = snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id }));
    if (filters?.folio) results = results.filter(r => r.folio.includes(filters.folio.toUpperCase()));
    if (filters?.clinicId) results = results.filter(r => r.clinicId === filters.clinicId);
    return results;
}

export async function getPrescriptionHistory(f: any) { 
    const snap = await getDocs(query(collection(adminDb, 'prescriptions'), where('status', '==', 'surtida'), limit(1000))); 
    let res = snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id }));
    if (f?.startDate && f?.endDate) res = res.filter(r => r.date >= f.startDate && r.date <= f.endDate);
    res.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return res;
}

// --- CONFIG GLOBALES ---
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

// --- MODULE SETTINGS ---
export async function getLabSettings() { const s = await getDoc(doc(adminDb, 'settings', 'labSettings')); return s.exists() ? serializeData(s.data()) : { dailySlots: 10 }; }
export async function updateLabSettings(s: any) { await setDoc(doc(adminDb, 'settings', 'labSettings'), s, { merge: true }); return { success: true }; }
export async function getXRaySettings() { const s = await getDoc(doc(adminDb, 'settings', 'xraySettings')); return s.exists() ? serializeData(s.data()) : { dailySlots: 10 }; }
export async function updateXRaySettings(s: any) { await setDoc(doc(adminDb, 'settings', 'xraySettings'), s, { merge: true }); return { success: true }; }
export async function getUltrasoundSettings() { const s = await getDoc(doc(adminDb, 'settings', 'ultrasoundSettings')); return s.exists() ? serializeData(s.data()) : { dailySlots: 10 }; }
export async function updateUltrasoundSettings(s: any) { await setDoc(doc(adminDb, 'settings', 'ultrasoundSettings'), s, { merge: true }); return { success: true }; }
export async function getVaccineSettings() { const s = await getDoc(doc(adminDb, 'settings', 'vaccineSettings')); return s.exists() ? serializeData(s.data()) : { dailySlots: 10 }; }
export async function updateVaccineSettings(s: any) { await setDoc(doc(adminDb, 'settings', 'vaccineSettings'), s, { merge: true }); return { success: true }; }

export async function getLabStudies() { const s = await getDocs(collection(adminDb, 'labStudies')); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateLabStudies(s: any[]) { const b = writeBatch(adminDb); s.forEach(x => b.set(doc(adminDb, 'labStudies', x.id), x)); await b.commit(); return { success: true }; }
export async function getXRayStudies() { const s = await getDocs(collection(adminDb, 'xrayStudies')); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateXRayStudies(s: any[]) { const b = writeBatch(adminDb); s.forEach(x => b.set(doc(adminDb, 'xrayStudies', x.id), x)); await b.commit(); return { success: true }; }
export async function getUltrasoundStudies() { const s = await getDocs(collection(adminDb, 'ultrasoundStudies')); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateUltrasoundStudies(s: any[]) { const b = writeBatch(adminDb); s.forEach(x => b.set(doc(adminDb, 'ultrasoundStudies', x.id), x)); await b.commit(); return { success: true }; }
export async function getVaccines() { const s = await getDocs(collection(adminDb, 'vaccines')); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateVaccines(s: any[]) { const b = writeBatch(adminDb); s.forEach(x => b.set(doc(adminDb, 'vaccines', x.id), x)); await b.commit(); return { success: true }; }

// --- INVENTARIOS ---
export async function getMedications() { const s = await getDocs(query(collection(adminDb, 'medications'), limit(5000))); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function bulkInsertMedications(items: any[]) {
    const batch = writeBatch(adminDb);
    items.forEach(i => {
        const id = String(i.claveCuadroBasico || uuidv4()).replace(/\//g, '-');
        batch.set(doc(adminDb, 'medications', id), { ...i, id, existencia: Number(i.existencia || 0) }, { merge: true });
    });
    await batch.commit();
    return { success: true, processedCount: items.length };
}
export async function deleteAllMedications() { const s = await getDocs(collection(adminDb, 'medications')); const b = writeBatch(adminDb); s.docs.forEach(d => b.delete(d.ref)); await b.commit(); return { success: true }; }

export async function getSupplies() { const s = await getDocs(query(collection(adminDb, 'supplies'), limit(5000))); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function bulkInsertSupplies(items: any[]) {
    const batch = writeBatch(adminDb);
    items.forEach(i => {
        const id = String(i.claveCuadroBasico || uuidv4()).replace(/\//g, '-');
        batch.set(doc(adminDb, 'supplies', id), { ...i, id, existencia: Number(i.existencia || 0) }, { merge: true });
    });
    await batch.commit();
    return { success: true, processedCount: items.length };
}
export async function deleteAllSupplies() { const s = await getDocs(collection(adminDb, 'supplies')); const b = writeBatch(adminDb); s.docs.forEach(d => b.delete(d.ref)); await b.commit(); return { success: true }; }

// --- BI Y MANTENIMIENTO ---
export async function getBIData() {
    const [apps, lab, xr, us, vac, clinics, colonias] = await Promise.all([
        getDocs(query(collection(adminDb, 'appointments'), limit(10000))),
        getDocs(query(collection(adminDb, 'labAppointments'), limit(10000))),
        getDocs(query(collection(adminDb, 'xrayAppointments'), limit(10000))),
        getDocs(query(collection(adminDb, 'ultrasoundAppointments'), limit(10000))),
        getDocs(query(collection(adminDb, 'vaccineAppointments'), limit(10000))),
        getClinicsData(),
        getColoniasData()
    ]);
    return {
        appointments: apps.docs.map(d => serializeData(d.data())),
        labAppointments: lab.docs.map(d => serializeData(d.data())),
        xRayAppointments: xr.docs.map(d => serializeData(d.data())),
        ultrasoundAppointments: us.docs.map(d => serializeData(d.data())),
        vaccineAppointments: vac.docs.map(d => serializeData(d.data())),
        clinics,
        colonias
    };
}

export async function getAttendedPatientsForClinic(cid: string) {
    const q = query(collection(adminDb, 'appointments'), where('clinicId', '==', cid), where('status', '==', 'Atendido'), limit(5000));
    const snap = await getDocs(q);
    const ids = Array.from(new Set(snap.docs.map(d => d.data().patientId)));
    if (ids.length === 0) return [];
    const patients: Patient[] = [];
    for (let i = 0; i < ids.length; i += 30) {
        const psnap = await getDocs(query(collection(adminDb, 'patients'), where('__name__', 'in', ids.slice(i, i+30))));
        psnap.forEach(d => patients.push({ ...d.data(), id: d.id } as Patient));
    }
    return serializeData(patients);
}

export async function cleanupOldRecords() {
    const b = writeBatch(adminDb);
    const snap = await getDocs(query(collection(adminDb, 'appointments'), where('date', '<', subDays(new Date(), 60).toISOString()), limit(500)));
    snap.docs.forEach(d => b.delete(d.ref));
    await b.commit();
    return { success: true, deletedCount: snap.size };
}

export async function searchCie10(t: string) { 
    const q = query(collection(adminDb, 'cie10Catalog'), where('nombre', '>=', t.toUpperCase()), limit(50));
    const s = await getDocs(q); 
    return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); 
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
    const snap = await getDocs(query(collection(adminDb, 'patients'), limit(10000)));
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
    const batch = writeBatch(adminDb);
    let found = 0;
    for (const exp of expedientes) {
        const q = query(collection(adminDb, 'patients'), where('expediente', '==', exp));
        const s = await getDocs(q);
        s.forEach(d => { batch.update(d.ref, { status }); found++; });
    }
    await batch.commit();
    return { success: true, count: found };
}

export async function getPatientPrescriptionsCountTodayAction(pid: string) {
    const today = startOfDay(new Date()).toISOString();
    const q = query(collection(adminDb, 'prescriptions'), where('patientId', '==', pid), where('date', '>=', today));
    const s = await getDocs(q);
    return s.size;
}

export async function bulkInsertCie10Glossary(data: any[]) { const b = writeBatch(adminDb); data.forEach(d => b.set(doc(adminDb, 'cie10Glossary', uuidv4()), d)); await b.commit(); return { success: true, processedCount: data.length }; }
export async function bulkInsertCie10Catalog(data: any[]) { const b = writeBatch(adminDb); data.forEach(d => b.set(doc(adminDb, 'cie10Catalog', d.catalogKey || uuidv4()), d)); await b.commit(); return { success: true, processedCount: data.length }; }
export async function deleteAllCie10Glossary() { const s = await getDocs(collection(adminDb, 'cie10Glossary')); const b = writeBatch(adminDb); s.docs.forEach(d => b.delete(d.ref)); await b.commit(); return { success: true }; }
export async function deleteAllCie10Catalog() { const s = await getDocs(collection(adminDb, 'cie10Catalog')); const b = writeBatch(adminDb); s.docs.forEach(d => b.delete(d.ref)); await b.commit(); return { success: true }; }

export async function bulkInsertDoctors(doctors: any[]) {
    const batch = writeBatch(adminDb);
    doctors.forEach(d => {
        const id = d.id || uuidv4();
        batch.set(doc(adminDb, 'clinics', id), {
            ...d, id,
            doctorName: String(d.doctorName || d['Médico'] || d['MÉDICO'] || '').toUpperCase().trim(),
            name: String(d.name || d['Unidad'] || d['UNIDAD'] || '').toUpperCase().trim(),
            password: '123',
            dailySlots: 10,
            startTime: '08:00',
            endTime: '13:00',
            bookingMode: BookingMode.Time
        }, { merge: true });
    });
    await batch.commit();
    return { success: true, processedCount: doctors.length };
}

export async function downloadBackupAction() {
    const [apps, lab, xr, us, vac, patients, clinics] = await Promise.all([
        getDocs(collection(adminDb, 'appointments')),
        getDocs(collection(adminDb, 'labAppointments')),
        getDocs(collection(adminDb, 'xrayAppointments')),
        getDocs(collection(adminDb, 'ultrasoundAppointments')),
        getDocs(collection(adminDb, 'vaccineAppointments')),
        getDocs(collection(adminDb, 'patients')),
        getDocs(collection(adminDb, 'clinics')),
    ]);
    return {
        success: true,
        data: {
            appointments: apps.docs.map(d => ({ ...d.data(), id: d.id })),
            labAppointments: lab.docs.map(d => ({ ...d.data(), id: d.id })),
            xRayAppointments: xr.docs.map(d => ({ ...d.data(), id: d.id })),
            ultrasoundAppointments: us.docs.map(d => ({ ...d.data(), id: d.id })),
            vaccineAppointments: vac.docs.map(d => ({ ...d.data(), id: d.id })),
            patients: patients.docs.map(d => ({ ...d.data(), id: d.id })),
            clinics: clinics.docs.map(d => ({ ...d.data(), id: d.id })),
        }
    };
}

export async function getAvailableSlotsForDate(cid: string, d: string) {
    return { timeSlots: ["08:00", "08:30", "09:00", "09:30", "10:00"], tokens: [1, 2, 3, 4, 5] };
}

export async function getAppointmentCountOnDate(clinicId: string, date: string) {
    const q = query(collection(adminDb, 'appointments'), where('clinicId', '==', clinicId), where('date', '>=', date), where('date', '<=', date + 'T23:59:59'));
    const snap = await getCountFromServer(q);
    return snap.data().count;
}
