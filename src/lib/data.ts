
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
  MedicalConsultation,
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
  Cie10Record,
} from './definitions';
import { PatientStatus, BookingMode } from './definitions';
import { v4 as uuidv4 } from 'uuid';
import { format as formatDateFns, startOfMonth, startOfDay, endOfDay, subDays, isValid, parse, isDate } from 'date-fns';

// --- SERIALIZACIÓN ---
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

// --- CONFIGURACIÓN DE SEGURIDAD (CON FALLBACK A MAESTRAS) ---
const DEFAULT_PASSWORDS: Record<string, string> = {
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

export async function getPasswordFromStore(id: string, def: string): Promise<string> {
    try {
        const s = await getDoc(doc(adminDb, 'module_passwords', id));
        return s.exists() ? s.data().password : def;
    } catch (e) {
        return def;
    }
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
    const success = pass === input;
    return { success, message: !success ? 'Contraseña de la unidad incorrecta.' : undefined };
}

// --- LOGS ---
export async function logActivity(action: string, details: string) {
    try {
        await addDoc(collection(adminDb, 'activityLog'), {
            timestamp: Timestamp.now(),
            action,
            details
        });
    } catch (e) {}
}

export async function getLogsData() {
    const q = query(collection(adminDb, 'activityLog'), orderBy('timestamp', 'desc'), limit(500));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id }));
}

// --- MOTOR DE IMPORTACIÓN EXCEL ---
function fuzzyMapInsumo(item: any) {
    const findValue = (header: string) => {
        if (item[header] !== undefined) return item[header];
        const normalizedHeader = header.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
        for (const key of Object.keys(item)) {
            const normalizedKey = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
            if (normalizedKey === normalizedHeader) return item[key];
        }
        return undefined;
    };

    const cadVal = findValue('FECHA CADUCIDAD');
    let formattedCaducidad = 'SIN FECHA';
    
    if (cadVal !== undefined && cadVal !== null) {
        if (isDate(cadVal)) {
            formattedCaducidad = formatDateFns(cadVal as Date, 'dd/MM/yyyy');
        } else if (typeof cadVal === 'number') {
            const excelEpoch = new Date(1899, 11, 30);
            const d = new Date(excelEpoch.getTime() + cadVal * 86400000);
            if (isValid(d)) formattedCaducidad = formatDateFns(d, 'dd/MM/yyyy');
        } else if (typeof cadVal === 'string' && cadVal.trim()) {
            const s = cadVal.trim();
            let d = parse(s, 'dd/MM/yyyy', new Date());
            if (!isValid(d)) d = parse(s, 'yyyy-MM-dd', new Date());
            if (!isValid(d)) d = new Date(s);
            formattedCaducidad = isValid(d) ? formatDateFns(d, 'dd/MM/yyyy') : s.toUpperCase();
        }
    }

    return {
        claveCuadroBasico: String(findValue('CLAVE DE CUADRO BASICO') || findValue('CLAVE') || 'S/C').trim(),
        descripcion: String(findValue('DESCRIPCIÓN') || findValue('DESCRIPCION') || 'SIN DESCRIPCIÓN').toUpperCase().trim(),
        grupo: String(findValue('GRUPO') || '').toUpperCase().trim(),
        existencia: Number(findValue('EXISTENCIA') || 0),
        precioUnitario: Number(findValue('PRECIO UNITARIO') || 0),
        totalImporte: Number(findValue('TOTAL IMPORTE') || 0),
        lote: String(findValue('LOTE') || 'N/A').toUpperCase().trim(),
        proveedor: String(findValue('PROVEEDOR') || '').toUpperCase().trim(),
        rfcProveedor: String(findValue('RFC PROVEEDOR') || '').toUpperCase().trim(),
        almacen: String(findValue('ALMACEN') || '').toUpperCase().trim(),
        fuenteFinanciamiento: String(findValue('FUENTE FINANCIAMIENTO') || '').toUpperCase().trim(),
        fechaCaducidad: formattedCaducidad,
        ordenSuministro: String(findValue('ORDEN SUMINISTRO') || '').toUpperCase().trim(),
        tipoInsumo: String(findValue('TIPO_INSUMO') || '').toUpperCase().trim(),
        numeroContrato: String(findValue('NUMERO DE CONTRATO') || '').toUpperCase().trim()
    };
}

// --- HIDRATACIÓN DE PACIENTES PARA REPORTES (FIX N/A) ---
export async function hydrateAppointments(appointments: any[]) {
    if (!appointments || appointments.length === 0) return [];
    
    const patientIdsToFetch = Array.from(new Set(
        appointments.filter(a => !a.patient && a.patientId).map(a => a.patientId)
    ));
    
    if (patientIdsToFetch.length === 0) return appointments;
    
    const patientsMap: Record<string, any> = {};
    for (let i = 0; i < patientIdsToFetch.length; i += 30) {
        const chunk = patientIdsToFetch.slice(i, i + 30);
        const q = query(collection(adminDb, 'patients'), where('curp', 'in', chunk));
        const snap = await getDocs(q);
        snap.forEach(d => { 
            const data = d.data();
            patientsMap[data.curp] = serializeData({ ...data, id: d.id }); 
        });
    }
    
    return appointments.map(app => ({
        ...app,
        patient: app.patient || (app.patientId ? patientsMap[app.patientId] : null)
    }));
}

// --- GESTIÓN DE PACIENTES ---

export async function getPatientsData(options?: any): Promise<Patient[]> {
    const colRef = collection(adminDb, 'patients');
    let q;
    if (options?.searchCurp) {
        q = query(colRef, where('curp', '==', options.searchCurp.toUpperCase().trim()), limit(1));
    } else if (options?.searchExpediente) {
        q = query(colRef, where('expediente', '==', options.searchExpediente), limit(100));
    } else if (options?.searchName) {
        q = query(colRef, where('name', '>=', options.searchName.toUpperCase()), limit(100));
    } else {
        q = query(colRef, limit(options?.limitNum || 100));
    }
    const s = await getDocs(q);
    return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })) as Patient[];
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

export async function savePatient(p: Omit<Patient, 'id'>, id: string) { 
    const finalId = id || p.curp;
    await setDoc(doc(adminDb, 'patients', finalId), { ...p, id: finalId }); 
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

export async function deletePatient(id: string) { 
    await deleteDoc(doc(adminDb, 'patients', id)); 
    return { success: true }; 
}

export async function deletePatients(ids: string[]) { 
    const b = writeBatch(adminDb); 
    ids.forEach(id => b.delete(doc(adminDb, 'patients', id))); 
    await b.commit(); 
    return { success: true }; 
}

export async function getPatientByCURP(curp: string) {
    const q = query(collection(adminDb, 'patients'), where('curp', '==', curp.toUpperCase().trim()), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) return { success: false };
    return { success: true, data: serializeData({ ...snap.docs[0].data(), id: snap.docs[0].id }) as Patient };
}

export async function bulkInsertPatients(patients: any[]) {
    const batch = writeBatch(adminDb);
    let count = 0;
    for (const p of patients) {
        const curp = String(p.CURP || p.curp || '').toUpperCase().trim();
        if (!curp) continue;
        const patientData = {
            id: curp,
            curp,
            name: String(p.Nombre || p.name || '').toUpperCase().trim(),
            paternalLastName: String(p.Apaterno || p.paternalLastName || '').toUpperCase().trim(),
            maternalLastName: String(p.Amaterno || p.maternalLastName || '').toUpperCase().trim(),
            expediente: String(p['No.Expediente'] || p.expediente || '').trim(),
            status: p.Estatus || p.status || PatientStatus.Vigente,
            phoneNumber: String(p.Telefono || p.phoneNumber || '').trim()
        };
        batch.set(doc(adminDb, 'patients', curp), patientData, { merge: true });
        count++;
    }
    await batch.commit();
    return { success: true, processedCount: count };
}

// --- GESTIÓN DE CITAS ---

export async function getAppointmentsData() { 
    const snap = await getDocs(query(collection(adminDb, 'appointments'), limit(1000))); 
    const apps = snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id }));
    return hydrateAppointments(apps);
}

export async function getLabAppointmentsData() { 
    const snap = await getDocs(query(collection(adminDb, 'labAppointments'), limit(1000))); 
    const apps = snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id }));
    return hydrateAppointments(apps);
}

export async function getXRayAppointmentsData() { 
    const snap = await getDocs(query(collection(adminDb, 'xrayAppointments'), limit(500))); 
    const apps = snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id }));
    return hydrateAppointments(apps);
}

export async function getUltrasoundAppointmentsData() { 
    const snap = await getDocs(query(collection(adminDb, 'ultrasoundAppointments'), limit(500))); 
    const apps = snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id }));
    return hydrateAppointments(apps);
}

export async function getVaccineAppointmentsData() { 
    const snap = await getDocs(query(collection(adminDb, 'vaccineAppointments'), limit(500))); 
    const apps = snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id }));
    return hydrateAppointments(apps);
}

export async function saveNewAppointment(a: any, p: any, isD: boolean, c?: string) { 
    const id = uuidv4(); 
    const apt = { ...a, id, patientId: p.curp, patient: p, coloniaName: c, createdAt: new Date().toISOString() };
    await setDoc(doc(adminDb, 'appointments', id), apt); 
    await setDoc(doc(adminDb, 'patients', p.curp), { ...p, id: p.curp }, { merge: true }); 
    return { success: true, data: { appointment: apt, clinic: { name: 'UNIDAD MÉDICA' } } }; 
}

export async function saveNewLabAppointment(a: any, p: any) { 
    const id = uuidv4(); 
    const apt = { ...a, id, patientId: p.curp, patient: p, createdAt: new Date().toISOString() };
    await setDoc(doc(adminDb, 'labAppointments', id), apt); 
    await setDoc(doc(adminDb, 'patients', p.curp), { ...p, id: p.curp }, { merge: true }); 
    return { success: true, data: apt }; 
}

export async function saveNewXRayAppointment(a: any, p: any) { 
    const id = uuidv4(); 
    const apt = { ...a, id, patientId: p.curp, patient: p, createdAt: new Date().toISOString() };
    await setDoc(doc(adminDb, 'xrayAppointments', id), apt); 
    await setDoc(doc(adminDb, 'patients', p.curp), { ...p, id: p.curp }, { merge: true }); 
    return { success: true, data: { appointment: apt, study: { name: a.studyName, indications: '' } } }; 
}

export async function saveNewUltrasoundAppointment(a: any, p: any) { 
    const id = uuidv4(); 
    const apt = { ...a, id, patientId: p.curp, patient: p, createdAt: new Date().toISOString() };
    await setDoc(doc(adminDb, 'ultrasoundAppointments', id), apt); 
    await setDoc(doc(adminDb, 'patients', p.curp), { ...p, id: p.curp }, { merge: true }); 
    return { success: true, data: { appointment: apt, study: { name: a.studyName, indications: '' } } }; 
}

export async function saveNewVaccineAppointment(a: any, p: any) { 
    const id = uuidv4(); 
    const apt = { ...a, id, patientId: p.curp, patient: p, createdAt: new Date().toISOString() };
    await setDoc(doc(adminDb, 'vaccineAppointments', id), apt); 
    await setDoc(doc(adminDb, 'patients', p.curp), { ...p, id: p.curp }, { merge: true }); 
    return { success: true, data: apt }; 
}

export async function deleteAppointment(id: string) { await deleteDoc(doc(adminDb, 'appointments', id)); return { success: true }; }
export async function deleteLabAppointment(id: string) { await deleteDoc(doc(adminDb, 'labAppointments', id)); return { success: true }; }
export async function deleteXRayAppointment(id: string) { await deleteDoc(doc(adminDb, 'xrayAppointments', id)); return { success: true }; }
export async function deleteUltrasoundAppointment(id: string) { await deleteDoc(doc(adminDb, 'ultrasoundAppointments', id)); return { success: true }; }
export async function deleteVaccineAppointment(id: string) { await deleteDoc(doc(adminDb, 'vaccineAppointments', id)); return { success: true }; }

export async function rescheduleAppointment(id: string, d: string, t: any) {
    const coll = t === 'medical' ? 'appointments' : t === 'lab' ? 'labAppointments' : t === 'xray' ? 'xrayAppointments' : t === 'ultrasound' ? 'ultrasoundAppointments' : 'vaccineAppointments';
    await updateDoc(doc(adminDb, coll, id), { date: d });
    return { success: true, message: 'Fecha actualizada.' };
}

export async function cloneAppointment(id: string, newDate: string, type: string, newTime?: string) {
    const coll = type === 'medical' ? 'appointments' : type === 'lab' ? 'labAppointments' : type === 'xray' ? 'xrayAppointments' : type === 'ultrasound' ? 'ultrasoundAppointments' : 'vaccineAppointments';
    const oldDoc = await getDoc(doc(adminDb, coll, id));
    if (!oldDoc.exists()) return { success: false, message: 'No existe.' };
    const data = oldDoc.data();
    const newId = uuidv4();
    const prefix = data.appointmentNumber?.split('-')[0] || 'CITA';
    const newFolio = `${prefix}-${uuidv4().split('-')[0].toUpperCase()}`;
    await setDoc(doc(adminDb, coll, newId), { ...data, id: newId, appointmentNumber: newFolio, date: newDate, time: newTime || data.time, status: 'Agendada', createdAt: new Date().toISOString() });
    return { success: true, message: `Clonada con folio ${newFolio}` };
}

export async function updateAppointmentStatus(id: string, s: string, t: any) { 
    const coll = t === 'medical' ? 'appointments' : t === 'lab' ? 'labAppointments' : t === 'xray' ? 'xrayAppointments' : t === 'ultrasound' ? 'ultrasoundAppointments' : 'vaccineAppointments';
    await updateDoc(doc(adminDb, coll, id), { status: s });
    return { success: true };
}

export async function getAppointmentsForClinic(cid: string) { 
    const q = query(collection(adminDb, 'appointments'), where('clinicId', '==', cid), limit(1000)); 
    const s = await getDocs(q); 
    const apps = s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); 
    return hydrateAppointments(apps);
}

// --- CLÍNICAS Y MÉDICOS ---

export async function getClinicsData(): Promise<Clinic[]> { 
    const snap = await getDocs(collection(adminDb, 'clinics')); 
    return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id } as Clinic)); 
}

export async function updateClinics(c: Clinic[]) { 
    const b = writeBatch(adminDb); 
    c.forEach(x => b.set(doc(adminDb, 'clinics', x.id), x)); 
    await b.commit(); 
    return { success: true }; 
}

export async function deleteClinic(id: string) {
    await deleteDoc(doc(adminDb, 'clinics', id));
    return { success: true };
}

export async function bulkInsertDoctors(d: any[]) { 
    const b = writeBatch(adminDb); 
    d.forEach(x => { const id = uuidv4(); b.set(doc(adminDb, 'clinics', id), { ...x, id }); }); 
    await b.commit(); 
    return { success: true, processedCount: d.length }; 
}

// --- FARMACIA Y ALMACÉN ---

export async function bulkInsertMedications(json: any[]) {
    const b = writeBatch(adminDb);
    let count = 0;
    json.forEach(item => {
        const med = fuzzyMapInsumo(item);
        const sanitizedId = (med.claveCuadroBasico + '_' + med.lote).replace(/\//g, '-').replace(/\s/g, '_');
        b.set(doc(adminDb, 'medications', sanitizedId), { ...med, id: sanitizedId, updatedAt: new Date().toISOString() }, { merge: true });
        count++;
    });
    await b.commit();
    return { success: true, processedCount: count };
}

export async function bulkInsertSupplies(json: any[]) {
    const b = writeBatch(adminDb);
    let count = 0;
    json.forEach(item => {
        const med = fuzzyMapInsumo(item);
        const sanitizedId = (med.claveCuadroBasico + '_' + med.lote).replace(/\//g, '-').replace(/\s/g, '_');
        b.set(doc(adminDb, 'supplies', sanitizedId), { ...med, id: sanitizedId, updatedAt: new Date().toISOString() }, { merge: true });
        count++;
    });
    await b.commit();
    return { success: true, processedCount: count };
}

export async function getMedications() { const snap = await getDocs(query(collection(adminDb, 'medications'), limit(1500))); return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })) as Medication[]; }
export async function getSupplies() { const snap = await getDocs(query(collection(adminDb, 'supplies'), limit(1500))); return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })) as Supply[]; }
export async function deleteAllMedications() { const s = await getDocs(collection(adminDb, 'medications')); const b = writeBatch(adminDb); s.docs.forEach(d => b.delete(d.ref)); await b.commit(); return { success: true }; }
export async function deleteAllSupplies() { const s = await getDocs(collection(adminDb, 'supplies')); const b = writeBatch(adminDb); s.docs.forEach(d => b.delete(d.ref)); await b.commit(); return { success: true }; }

// --- CONFIGURACIÓN Y SETTINGS ---

export async function getModuleSettings(): Promise<ModuleSettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'moduleSettings'));
    return s.exists() ? serializeData(s.data()) as ModuleSettings : { 
        citasMedicasEnabled: true, laboratorioEnabled: true, rayosXEnabled: true, ultrasoundEnabled: true, vacunasEnabled: true, 
        archivoEnabled: true, farmaciaEnabled: true, almacenEnabled: true, archivoConsultaEnabled: true,
        citasMedicasWhatsAppEnabled: true, laboratorioWhatsAppEnabled: true, rayosXWhatsAppEnabled: true, ultrasoundWhatsAppEnabled: true, vacunasWhatsAppEnabled: true, archivoWhatsAppEnabled: true,
        citasMedicasPassword: DEFAULT_PASSWORDS.medical, archivoConsultaPassword: DEFAULT_PASSWORDS.archiveInquiry
    };
}

export async function getAdminSettingsData() { const p = await getPasswordFromStore('superadmin', DEFAULT_PASSWORDS.superadmin); return { password: p }; }
export async function updateAdminSettings(s: any) { await setDoc(doc(adminDb, 'module_passwords', 'superadmin'), { password: s.password }); return { success: true }; }
export async function updateModuleSettings(s: ModuleSettings) { await setDoc(doc(adminDb, 'settings', 'moduleSettings'), s); return { success: true }; }
export async function updateArchiveSettings(s: any) { await setDoc(doc(adminDb, 'module_passwords', 'archive'), { password: s.password }); return { success: true }; }
export async function updatePharmacySettings(s: any) { await setDoc(doc(adminDb, 'module_passwords', 'pharmacy'), { password: s.password }); return { success: true }; }
export async function updateWarehouseSettings(s: any) { await setDoc(doc(adminDb, 'module_passwords', 'warehouse'), { password: s.password }); return { success: true }; }
export async function updateBISettings(s: any) { await setDoc(doc(adminDb, 'module_passwords', 'bi'), { password: s.password }); return { success: true }; }

export async function getAnnouncementsData() { const snap = await getDoc(doc(adminDb, 'settings', 'announcements')); return snap.exists() ? snap.data().messages : []; }
export async function updateAnnouncements(m: string[]) { await setDoc(doc(adminDb, 'settings', 'announcements'), { messages: m }); return { success: true }; }

export async function getHolidaysData() { const snap = await getDocs(collection(adminDb, 'holidays')); return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateHolidays(h: Holiday[]) { const b = writeBatch(adminDb); h.forEach(x => b.set(doc(adminDb, 'holidays', x.date), x)); await b.commit(); return { success: true }; }

export async function getSpecialActionDaysData() { const snap = await getDocs(collection(adminDb, 'specialActionDays')); return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateSpecialActionDays(i: SpecialActionDay[]) { const b = writeBatch(adminDb); i.forEach(x => b.set(doc(adminDb, 'specialActionDays', x.date + '_' + x.clinicType), x)); await b.commit(); return { success: true }; }

export async function getServiceTypesData() { const snap = await getDocs(collection(adminDb, 'serviceTypes')); return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateServiceTypes(t: any[]) { const b = writeBatch(adminDb); t.forEach(x => b.set(doc(adminDb, 'serviceTypes', x.id), x)); await b.commit(); return { success: true }; }

export async function getSpecialtiesData() { const snap = await getDocs(collection(adminDb, 'specialties')); return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateSpecialties(t: any[]) { const b = writeBatch(adminDb); t.forEach(x => b.set(doc(adminDb, 'specialties', x.id), x)); await b.commit(); return { success: true }; }

export async function getColoniasData() { const snap = await getDocs(collection(adminDb, 'colonias')); return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateColonias(c: Colonia[]) { const b = writeBatch(adminDb); c.forEach(x => b.set(doc(adminDb, 'colonias', x.id), x)); await b.commit(); return { success: true }; }

export async function getRawCollection(collectionName: string, limitNum: number = 500) {
    const snap = await getDocs(query(collection(adminDb, collectionName), limit(limitNum)));
    return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id }));
}

// --- SETTINGS ESPECÍFICOS ---

export async function getLabSettings() { const s = await getDoc(doc(adminDb, 'settings', 'labSettings')); return s.exists() ? serializeData(s.data()) as LabSettings : { dailySlots: 10, waitlistSlots: 0, weekendBookingEnabled: false, startTime: '08:00', endTime: '13:00' }; }
export async function updateLabSettings(s: LabSettings) { await setDoc(doc(adminDb, 'settings', 'labSettings'), s); return { success: true }; }
export async function getXRaySettings() { const s = await getDoc(doc(adminDb, 'settings', 'xraySettings')); return s.exists() ? serializeData(s.data()) as XRaySettings : { dailySlots: 10, waitlistSlots: 0, weekendBookingEnabled: false, startTime: '08:00', endTime: '13:00' }; }
export async function updateXRaySettings(s: XRaySettings) { await setDoc(doc(adminDb, 'settings', 'xraySettings'), s); return { success: true }; }
export async function getUltrasoundSettings() { const s = await getDoc(doc(adminDb, 'settings', 'ultrasoundSettings')); return s.exists() ? serializeData(s.data()) as UltrasoundSettings : { dailySlots: 10, waitlistSlots: 0, weekendBookingEnabled: false, startTime: '08:00', endTime: '13:00' }; }
export async function updateUltrasoundSettings(s: UltrasoundSettings) { await setDoc(doc(adminDb, 'settings', 'ultrasoundSettings'), s); return { success: true }; }
export async function getVaccineSettings() { const s = await getDoc(doc(adminDb, 'settings', 'vaccineSettings')); return s.exists() ? serializeData(s.data()) as VaccineSettings : { dailySlots: 10, waitlistSlots: 0, weekendBookingEnabled: false, startTime: '08:00', endTime: '13:00' }; }
export async function updateVaccineSettings(s: VaccineSettings) { await setDoc(doc(adminDb, 'settings', 'vaccineSettings'), s); return { success: true }; }

export async function getLabStudies() { const snap = await getDocs(collection(adminDb, 'labStudies')); return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateLabStudies(s: LabStudy[]) { const b = writeBatch(adminDb); s.forEach(x => b.set(doc(adminDb, 'labStudies', x.id), x)); await b.commit(); return { success: true }; }
export async function updateXRayStudies(s: XRayStudy[]) { const b = writeBatch(adminDb); s.forEach(x => b.set(doc(adminDb, 'xrayStudies', x.id), x)); await b.commit(); return { success: true }; }
export async function updateUltrasoundStudies(s: UltrasoundStudy[]) { const b = writeBatch(adminDb); s.forEach(x => b.set(doc(adminDb, 'ultrasoundStudies', x.id), x)); await b.commit(); return { success: true }; }
export async function updateVaccines(v: Vaccine[]) {
    const b = writeBatch(adminDb);
    const snap = await getDocs(collection(adminDb, 'vaccines'));
    snap.docs.forEach(d => b.delete(d.ref));
    v.forEach(x => b.set(doc(adminDb, 'vaccines', x.id), x));
    await b.commit();
    return { success: true };
}

// --- CONSULTAS Y RECETAS ---

export async function getConsultationsByPatientId(pid: string) { const q = query(collection(adminDb, 'medicalConsultations'), where('patientId', '==', pid), limit(50)); const s = await getDocs(q); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })) as MedicalConsultation[]; }
export async function getConsultationByAppointmentId(aid: string) { const q = query(collection(adminDb, 'medicalConsultations'), where('appointmentId', '==', aid), limit(1)); const s = await getDocs(q); return s.empty ? null : { ...serializeData(s.docs[0].data()), id: s.docs[0].id } as MedicalConsultation; }
export async function saveMedicalConsultation(c: any) { const id = c.id || uuidv4(); await setDoc(doc(adminDb, 'medicalConsultations', id), { ...c, id, createdAt: new Date().toISOString() }); return { success: true, id }; }
export async function deleteMedicalConsultation(id: string) { await deleteDoc(doc(adminDb, 'medicalConsultations', id)); return { success: true }; }
export async function getPrescriptionsByPatientId(pid: string) { const q = query(collection(adminDb, 'prescriptions'), where('patientId', '==', pid), limit(20)); const snap = await getDocs(q); return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })) as Prescription[]; }
export async function createPrescription(p: any) { const id = uuidv4(); const f = `REC-${Math.floor(1000 + Math.random() * 9000)}`; const data = { ...p, id, folio: f, status: 'pendiente', createdAt: new Date().toISOString(), expiresAt: formatDateFns(new Date().getTime() + 86400000, 'yyyy-MM-dd HH:mm') }; await setDoc(doc(adminDb, 'prescriptions', id), data); return { success: true, folio: f, prescription: data }; }
export async function updatePrescription(id: string, p: any) { await updateDoc(doc(adminDb, 'prescriptions', id), p); return { success: true }; }
export async function deletePrescription(id: string) { await deleteDoc(doc(adminDb, 'prescriptions', id)); return { success: true }; }
export async function dispensePrescription(id: string, items: any[]) { const b = writeBatch(adminDb); for (const i of items) { b.update(doc(adminDb, 'medications', i.medicationId), { existencia: increment(-i.quantity) }); } b.update(doc(adminDb, 'prescriptions', id), { status: 'surtida', dispensedAt: new Date().toISOString() }); await b.commit(); return { success: true }; }
export async function getPendingPrescriptions(f: any) { let q = query(collection(adminDb, 'prescriptions'), where('status', '==', 'pendiente'), limit(20)); if (f.folio) q = query(collection(adminDb, 'prescriptions'), where('folio', '==', f.folio.toUpperCase().trim())); const snap = await getDocs(q); return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })) as Prescription[]; }
export async function getPrescriptionHistory(f: any) { let q = query(collection(adminDb, 'prescriptions'), where('status', '==', 'surtida'), limit(100)); if (f.startDate) q = query(collection(adminDb, 'prescriptions'), where('date', '>=', f.startDate), where('date', '<=', f.endDate), limit(500)); const snap = await getDocs(q); return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })) as Prescription[]; }

// --- OTROS ---
export async function searchCie10(term: string) { const q = query(collection(adminDb, 'cie10Catalog'), where('nombre', '>=', term.toUpperCase()), limit(20)); const s = await getDocs(q); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })) as Cie10Record[]; }
export async function getAppointmentCountOnDate(cid: string, d: string) { const dOnly = d.split('T')[0]; const q = query(collection(adminDb, 'appointments'), where('clinicId', '==', cid), where('date', '>=', dOnly), where('date', '<=', dOnly + 'T23:59:59')); const s = await getCountFromServer(q); return s.data().count; }
export async function getAttendedPatientsForClinic(cid: string) { const q = query(collection(adminDb, 'appointments'), where('clinicId', '==', cid), where('status', '==', 'Atendido'), limit(200)); const s = await getDocs(q); return s.docs.map(d => ({ ...serializeData(d.data().patient), id: d.data().patientId })); }
export async function getPatientPrescriptionsCountTodayAction(pId: string) { const s = startOfDay(new Date()).toISOString(); const q = query(collection(adminDb, 'prescriptions'), where('patientId', '==', pId), where('date', '>=', s)); const snap = await getCountFromServer(q); return snap.data().count; }

export async function getBIData() {
    const [apps, lab, xr, us, vac, clinics, colonias] = await Promise.all([
        getAppointmentsData(), getLabAppointmentsData(), getXRayAppointmentsData(), getUltrasoundAppointmentsData(), getVaccineAppointmentsData(), getClinicsData(), getColoniasData()
    ]);
    return { appointments: apps, labAppointments: lab, xRayAppointments: xr, ultrasoundAppointments: us, vaccineAppointments: vac, clinics, colonias };
}
