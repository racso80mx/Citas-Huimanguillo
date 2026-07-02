
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
  startAt,
  endAt
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
  Cie10Record
} from './definitions';
import { PatientStatus, BookingMode } from './definitions';
import { v4 as uuidv4 } from 'uuid';
import { format as formatDate, startOfMonth, startOfDay, endOfDay } from 'date-fns';

// --- UTILIDADES DE SERIALIZACIÓN ---
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

// --- MOTOR DE MAPEO INTELIGENTE (EXCEL) ---
function fuzzyMapInsumo(item: any) {
    const keys = Object.keys(item);
    const normalize = (s: string) => String(s || '').toLowerCase().trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, '');
        
    const findValue = (options: string[]) => {
        const normalizedOptions = options.map(normalize);
        const foundKey = keys.find(k => normalizedOptions.includes(normalize(k)));
        return foundKey ? item[foundKey] : undefined;
    };

    return {
        claveCuadroBasico: String(findValue(['clave', 'clavedecuadrobasico', 'articulo', 'codigo', 'cod', 'idinsumo', 'clv', 'clavebasica', 'cve']) || 'S/C'),
        descripcion: String(findValue(['descripcion', 'nombre', 'insumo', 'producto', 'articulo', 'desc', 'sustancia', 'descripciondelarticulo']) || 'SIN DESCRIPCIÓN').toUpperCase(),
        existencia: Number(findValue(['existencia', 'stock', 'cantidad', 'actual', 'total', 'cant', 'stockactual', 'disponible', 'existencias', 'entradas', 'salidas']) || 0),
        fechaCaducidad: String(findValue(['caducidad', 'vencimiento', 'fechadecaducidad', 'vence', 'fecha', 'venc', 'f.caducidad', 'expiracion', 'vencimientolote']) || ''),
        lote: String(findValue(['lote', 'numerodelote', 'loteo', 'n.lote', 'lot', 'num.lote', 'batch']) || 'N/A').toUpperCase(),
        grupo: String(findValue(['grupo', 'categoria', 'familia', 'tipo', 'clasificacion']) || '').toUpperCase(),
        precioUnitario: Number(findValue(['precio', 'preciounitario', 'costo', 'valor']) || 0),
        almacen: String(findValue(['almacen', 'deposito', 'bodega', 'unidad']) || '').toUpperCase()
    };
}

// --- LECTURA DE COLECCIONES ---
export async function getRawCollection(name: string, limitNum: number = 10000) {
    try {
        const colRef = collection(adminDb, name);
        const q = query(colRef, limit(Math.min(limitNum, 10000)));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id }));
    } catch (e) {
        console.error(`Error al leer colección ${name}:`, e);
        return [];
    }
}

async function getPatientsForApps(apps: any[]) {
    const pIds = Array.from(new Set(apps.map(a => a.patientId).filter(id => !!id)));
    if (pIds.length === 0) return [];
    const pats: any[] = [];
    for (let i = 0; i < pIds.length; i += 30) {
        const chunk = pIds.slice(i, i + 30);
        const q = query(collection(adminDb, 'patients'), where('__name__', 'in', chunk));
        const snap = await getDocs(q);
        pats.push(...snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })));
    }
    return pats;
}

async function getPasswordFromStore(id: string, defaultPass: string): Promise<string> {
    try {
        const snap = await getDoc(doc(adminDb, 'module_passwords', id));
        return snap.exists() ? snap.data().password : defaultPass;
    } catch (e) {
        return defaultPass;
    }
}

// --- ACTIVIDAD Y LOGS ---
export async function logActivity(action: string, details: string) { 
    try {
        await addDoc(collection(adminDb, 'activityLog'), { timestamp: new Date().toISOString(), action: action.toUpperCase(), details }); 
    } catch (e) {}
    return { success: true }; 
}

export async function getLogsData() {
  const colRef = collection(adminDb, 'activityLog');
  const q = query(colRef, limit(500));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ ...serializeData(d.data()), id: d.id }))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

// --- MÓDULOS Y SEGURIDAD ---
export async function getModuleSettings(): Promise<ModuleSettings> {
  const snap = await getDoc(doc(adminDb, 'settings', 'moduleSettings'));
  const base = snap.exists() ? serializeData(snap.data()) as ModuleSettings : {
    citasMedicasEnabled: true, laboratorioEnabled: true, rayosXEnabled: true, ultrasoundEnabled: true, vacunasEnabled: true,
    archivoEnabled: true, farmaciaEnabled: true, almacenEnabled: true, archivoConsultaEnabled: true,
    citasMedicasWhatsAppEnabled: true, laboratorioWhatsAppEnabled: true, rayosXWhatsAppEnabled: true, ultrasoundWhatsAppEnabled: true, vacunasWhatsAppEnabled: true, archivoWhatsAppEnabled: true
  };
  const [citasPass, consultaPass] = await Promise.all([getPasswordFromStore('medical', 'citas2026'), getPasswordFromStore('archiveInquiry', '2026')]);
  return { ...base, citasMedicasPassword: citasPass, archivoConsultaPassword: consultaPass };
}

export async function updateModuleSettings(settings: ModuleSettings) {
    const { citasMedicasPassword, archivoConsultaPassword, ...rest } = settings;
    const batch = writeBatch(adminDb);
    batch.set(doc(adminDb, 'settings', 'moduleSettings'), rest);
    if (citasMedicasPassword) batch.set(doc(adminDb, 'module_passwords', 'medical'), { password: citasMedicasPassword });
    if (archivoConsultaPassword) batch.set(doc(adminDb, 'module_passwords', 'archiveInquiry'), { password: archivoConsultaPassword });
    await batch.commit();
    return { success: true };
}

export async function verifyModulePassword(id: string, p: string) {
    const pass = await getPasswordFromStore(id, ''); 
    const defaults: Record<string, string> = {
        medical: 'citas2026', archive: '2026', archiveInquiry: '2026', pharmacy: 'farmacia2026', warehouse: 'almacen2026',
        bi: 'bi2026', lab: 'lab2026', xray: 'rx2026', ultrasound: 'us2026', vaccine: 'vac2026', superadmin: 'Hu1m4ngu1ll0'
    };
    const targetPass = pass || defaults[id] || '123';
    return { success: targetPass === p, message: targetPass !== p ? 'Contraseña incorrecta' : undefined };
}

export async function verifyClinicPassword(id: string, p: string) {
    const snap = await getDoc(doc(adminDb, 'clinic_settings', id));
    const pass = snap.exists() ? snap.data().password : '123';
    return { success: pass === p, message: pass !== p ? 'Contraseña incorrecta' : undefined };
}

// --- PACIENTES (OPTIMIZADO PARA ARCHIVO Y BÚSQUEDA PRECISA) ---
export async function getPatientsData(options?: any): Promise<Patient[]> {
  const colRef = collection(adminDb, 'patients');

  if (options?.searchCurp) {
    const q = query(colRef, where('curp', '==', options.searchCurp.toUpperCase().trim()), limit(20));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })) as Patient[];
  }

  if (options?.searchExpediente) {
    const q = query(colRef, where('expediente', '==', options.searchExpediente.trim()), limit(20));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })) as Patient[];
  }

  if (options?.searchName) {
    const term = options.searchName.toUpperCase().trim();
    const words = term.split(' ').filter((w: string) => w.length > 0);
    if (words.length === 0) return [];

    const firstWord = words[0];
    const q1 = query(colRef, where('paternalLastName', '>=', firstWord), where('paternalLastName', '<=', firstWord + '\uf8ff'), limit(2000));
    const q2 = query(colRef, where('name', '>=', firstWord), where('name', '<=', firstWord + '\uf8ff'), limit(2000));
    const q3 = query(colRef, where('maternalLastName', '>=', firstWord), where('maternalLastName', '<=', firstWord + '\uf8ff'), limit(2000));
    
    const [snap1, snap2, snap3] = await Promise.all([getDocs(q1), getDocs(q2), getDocs(q3)]);
    
    const resultsMap = new Map<string, Patient>();
    [...snap1.docs, ...snap2.docs, ...snap3.docs].forEach(d => {
        const data = { ...serializeData(d.data()), id: d.id } as Patient;
        resultsMap.set(d.id, data);
    });

    let results = Array.from(resultsMap.values());
    results = results.filter(p => {
        const fullName = `${p.name} ${p.paternalLastName} ${p.maternalLastName}`.toUpperCase();
        return words.every((word: string) => fullName.includes(word));
    });

    return results.sort((a,b) => (a.paternalLastName || '').localeCompare(b.paternalLastName || ''));
  }

  let q: Query<DocumentData> = colRef;
  if (options?.status && options.status !== 'Total') {
      q = query(colRef, where('status', '==', options.status), limit(options?.limitNum || 1000));
  } else {
      q = query(colRef, limit(options?.limitNum || 1000));
  }
  
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })) as Patient[];
}

export async function getPatientCounts(): Promise<ArchiveCounts> {
  const colRef = collection(adminDb, 'patients');
  const [totalSnap, vigenteSnap, bajaSnap, bajaDefSnap] = await Promise.all([
    getCountFromServer(colRef),
    getCountFromServer(query(colRef, where('status', '==', PatientStatus.Vigente))),
    getCountFromServer(query(colRef, where('status', '==', PatientStatus.Baja))),
    getCountFromServer(query(colRef, where('status', '==', PatientStatus.BajaDefinitiva)))
  ]);
  return { total: totalSnap.data().count, vigente: vigenteSnap.data().count, bajaTemporal: bajaSnap.data().count, bajaDefinitiva: bajaDefSnap.data().count };
}

export async function savePatient(patient: Omit<Patient, 'id'>, id: string) {
    const finalId = id || uuidv4();
    await setDoc(doc(adminDb, 'patients', finalId), { ...patient, id: finalId }, { merge: true });
    return { success: true, id: finalId };
}

export async function updatePatient(id: string, patient: Partial<Patient>) {
    await updateDoc(doc(adminDb, 'patients', id), patient);
    return { success: true };
}

export async function updatePatientStatus(id: string, s: string) { await updateDoc(doc(adminDb, 'patients', id), { status: s }); return { success: true }; }
export async function deletePatient(id: string) { await deleteDoc(doc(adminDb, 'patients', id)); return { success: true }; }
export async function deletePatients(ids: string[]) { const batch = writeBatch(adminDb); ids.forEach(id => batch.delete(doc(adminDb, 'patients', id))); await batch.commit(); return { success: true }; }

export async function getPatientByCURP(curp: string) {
    const q = query(collection(adminDb, 'patients'), where('curp', '==', curp.toUpperCase()), limit(1));
    const snap = await getDocs(q);
    return snap.empty ? { success: false } : { success: true, data: { ...serializeData(snap.docs[0].data()), id: snap.docs[0].id } };
}

export async function bulkInsertPatients(patients: any[]) {
    const patientsCol = collection(adminDb, 'patients');
    let added = 0; let updated = 0;
    for (let i = 0; i < patients.length; i += 30) {
        const chunk = patients.slice(i, i + 30);
        const curps = chunk.map(p => String(p.CURP || p.curp || '').toUpperCase().trim()).filter(Boolean);
        if (curps.length === 0) continue;
        const q = query(patientsCol, where('curp', 'in', curps));
        const snap = await getDocs(q);
        const existingMap = new Map(snap.docs.map(d => [d.data().curp, d.ref]));
        const batch = writeBatch(adminDb);
        chunk.forEach(p => {
            const curp = String(p.CURP || p.curp || '').toUpperCase().trim();
            if (!curp) return;
            const patientData = {
                expediente: String(p['No.Expediente'] || p.expediente || ''),
                name: String(p.Nombre || p.name || '').toUpperCase().trim(),
                paternalLastName: String(p.Apaterno || p.paternalLastName || '').toUpperCase().trim(),
                maternalLastName: String(p.Amaterno || p.maternalLastName || '').toUpperCase().trim(),
                curp, birthDate: String(p.FNacimiento || p.birthDate || ''),
                age: Number(p.Edad || p.age || 0), sex: String(p.Sexo || p.sex || 'Hombre') as 'Hombre' | 'Mujer',
                birthState: String(p.Estado || p.birthState || 'TABASCO').toUpperCase(), address: String(p.Domicilio || p.address || '').toUpperCase(),
                coloniaName: String(p.Colonia || p.coloniaName || '').toUpperCase(), phoneNumber: String(p.Telefono || p.phoneNumber || ''),
                status: (p.Estatus || p.status || PatientStatus.Vigente) as PatientStatus,
                registrationDate: String(p.FechaApertura || p.registrationDate || formatDate(new Date(), 'yyyy-MM-dd')),
                derechoAbiencia: String(p.DerechoAbiencia || p.derechoAbiencia || '').toUpperCase() || null
            };
            const existingRef = existingMap.get(curp);
            if (existingRef) { batch.update(existingRef, patientData); updated++; }
            else { const nid = uuidv4(); batch.set(doc(adminDb, 'patients', nid), { ...patientData, id: nid }); added++; }
        });
        await batch.commit();
    }
    return { success: true, addedCount: added, updatedCount: updated, processedCount: patients.length };
}

// --- CITAS ---
export async function getAppointmentsData() {
    const apps = await getRawCollection('appointments', 10000); 
    const pats = await getPatientsForApps(apps);
    const clinics = await getClinicsData();
    return apps.map(a => ({ ...a, patient: pats.find(p => p.id === a.patientId), clinicName: clinics.find(c => c.id === a.clinicId)?.name || a.clinicName || 'N/A' }));
}
export async function getLabAppointmentsData() { const apps = await getRawCollection('labAppointments', 10000); const pats = await getPatientsForApps(apps); return apps.map(a => ({ ...a, patient: pats.find(p => p.id === a.patientId) })); }
export async function getXRayAppointmentsData() { const apps = await getRawCollection('xrayAppointments', 10000); const pats = await getPatientsForApps(apps); return apps.map(a => ({ ...a, patient: pats.find(p => p.id === a.patientId) })); }
export async function getUltrasoundAppointmentsData() { const apps = await getRawCollection('ultrasoundAppointments', 10000); const pats = await getPatientsForApps(apps); return apps.map(a => ({ ...a, patient: pats.find(p => p.id === a.patientId) })); }
export async function getVaccineAppointmentsData() { const apps = await getRawCollection('vaccineAppointments', 10000); const pats = await getPatientsForApps(apps); return apps.map(a => ({ ...a, patient: pats.find(p => p.id === a.patientId) })); }

export async function deleteAppointment(id: string) { await deleteDoc(doc(adminDb, 'appointments', id)); return { success: true }; }
export async function deleteLabAppointment(id: string) { await deleteDoc(doc(adminDb, 'labAppointments', id)); return { success: true }; }
export async function deleteXRayAppointment(id: string) { await deleteDoc(doc(adminDb, 'xrayAppointments', id)); return { success: true }; }
export async function deleteUltrasoundAppointment(id: string) { await deleteDoc(doc(adminDb, 'ultrasoundAppointments', id)); return { success: true }; }
export async function deleteVaccineAppointment(id: string) { await deleteDoc(doc(adminDb, 'vaccineAppointments', id)); return { success: true }; }

export async function updateAppointmentStatus(aid: string, s: string, type: string) {
    const coll = type === 'medical' ? 'appointments' : type === 'lab' ? 'labAppointments' : type === 'xray' ? 'xrayAppointments' : type === 'ultrasound' ? 'ultrasoundAppointments' : 'vaccineAppointments';
    await updateDoc(doc(adminDb, coll, aid), { status: s }); return { success: true };
}

export async function getAppointmentsForClinic(clinicId: string) {
    const apps = await getRawCollection('appointments', 10000);
    const clinics = await getClinicsData();
    const target = clinics.find(c => c.id === clinicId);
    const pats = await getPatientsForApps(apps);
    return apps.filter(a => a.clinicId === clinicId || (target && (a.clinicName || '').toUpperCase() === target.name.toUpperCase()))
               .map(a => ({ ...a, patient: pats.find(p => p.id === a.patientId), clinicName: target?.name || a.clinicName }));
}

export async function saveNewAppointment(appointment: any, patient: any, isDouble: boolean, colonia?: string) {
    const batch = writeBatch(adminDb); let pId = patient.id;
    if (!pId) {
        const q = query(collection(adminDb, 'patients'), where('curp', '==', patient.curp.toUpperCase()), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) { pId = snap.docs[0].id; batch.update(snap.docs[0].ref, { ...patient, lastAppointmentDate: appointment.date }); }
        else { pId = uuidv4(); batch.set(doc(adminDb, 'patients', pId), { ...patient, id: pId, lastAppointmentDate: appointment.date }); }
    }
    const aId = uuidv4();
    const folio = `FOL-${Math.floor(1000 + Math.random() * 9000)}-${formatDate(new Date(), 'mmss')}`;
    const newApp = { ...appointment, patientId: pId, appointmentNumber: folio, createdAt: new Date().toISOString(), id: aId, coloniaName: colonia || null };
    batch.set(doc(adminDb, 'appointments', aId), newApp);
    await batch.commit();
    const clinics = await getClinicsData();
    return { success: true, data: { appointment: { ...newApp, patient }, clinic: clinics.find(c => c.id === appointment.clinicId) } };
}

export async function saveNewLabAppointment(appointment: any, patient: any) {
    const batch = writeBatch(adminDb); const q = query(collection(adminDb, 'patients'), where('curp', '==', patient.curp.toUpperCase()), limit(1));
    const snap = await getDocs(q); let pId = snap.empty ? uuidv4() : snap.docs[0].id;
    batch.set(doc(adminDb, 'patients', pId), { ...patient, id: pId }, { merge: true });
    const aId = uuidv4(); batch.set(doc(adminDb, 'labAppointments', aId), { ...appointment, id: aId, patientId: pId, createdAt: new Date().toISOString() });
    await batch.commit(); return { success: true, data: { ...appointment, patient } };
}

export async function saveNewXRayAppointment(appointment: any, patient: any) {
    const batch = writeBatch(adminDb); const q = query(collection(adminDb, 'patients'), where('curp', '==', patient.curp.toUpperCase()), limit(1));
    const snap = await getDocs(q); let pId = snap.empty ? uuidv4() : snap.docs[0].id;
    batch.set(doc(adminDb, 'patients', pId), { ...patient, id: pId }, { merge: true });
    const aId = uuidv4(); batch.set(doc(adminDb, 'xrayAppointments', aId), { ...appointment, id: aId, patientId: pId, createdAt: new Date().toISOString() });
    await batch.commit(); return { success: true, data: { appointment: { ...appointment, patient }, study: { name: appointment.studyName, indications: '' } } };
}

export async function saveNewUltrasoundAppointment(appointment: any, patient: any) {
    const batch = writeBatch(adminDb); const q = query(collection(adminDb, 'patients'), where('curp', '==', patient.curp.toUpperCase()), limit(1));
    const snap = await getDocs(q); let pId = snap.empty ? uuidv4() : snap.docs[0].id;
    batch.set(doc(adminDb, 'patients', pId), { ...patient, id: pId }, { merge: true });
    const aId = uuidv4(); batch.set(doc(adminDb, 'ultrasoundAppointments', aId), { ...appointment, id: aId, patientId: pId, createdAt: new Date().toISOString() });
    await batch.commit(); return { success: true, data: { appointment: { ...appointment, patient }, study: { name: appointment.studyName, indications: '' } } };
}

export async function saveNewVaccineAppointment(appointment: any, patient: any) {
    const batch = writeBatch(adminDb); const q = query(collection(adminDb, 'patients'), where('curp', '==', patient.curp.toUpperCase()), limit(1));
    const snap = await getDocs(q); let pId = snap.empty ? uuidv4() : snap.docs[0].id;
    batch.set(doc(adminDb, 'patients', pId), { ...patient, id: pId }, { merge: true });
    const aId = uuidv4(); batch.set(doc(adminDb, 'vaccineAppointments', aId), { ...appointment, id: aId, patientId: pId, createdAt: new Date().toISOString() });
    await batch.commit(); return { success: true, data: { ...appointment, patient } };
}

// --- CLÍNICAS ---
export async function getClinicsData(): Promise<Clinic[]> { 
    const [clinicsSnap, settingsSnap] = await Promise.all([getDocs(collection(adminDb, 'clinics')), getDocs(collection(adminDb, 'clinic_settings'))]);
    const settingsMap = new Map(); settingsSnap.docs.forEach(d => settingsMap.set(d.id, d.data()));
    return clinicsSnap.docs.map(d => ({ ...serializeData(d.data()), ...(settingsMap.get(d.id) || {}), id: d.id } as Clinic));
}

export async function updateClinics(clinics: Clinic[]) { 
    const batch = writeBatch(adminDb); 
    clinics.forEach(c => {
        const { id, unavailableDates, customSchedules, daysOfAction, password, ...baseInfo } = c;
        batch.set(doc(adminDb, 'clinics', id), { ...baseInfo, id }, { merge: true });
        batch.set(doc(adminDb, 'clinic_settings', id), { unavailableDates: unavailableDates || [], customSchedules: customSchedules || [], daysOfAction: daysOfAction || [], password: password || '123' }, { merge: true });
    });
    await batch.commit(); return { success: true }; 
}

export async function deleteClinic(id: string) { await deleteDoc(doc(adminDb, 'clinics', id)); return { success: true }; }

export async function bulkInsertDoctors(doctors: any[]) { 
    const batch = writeBatch(adminDb); 
    doctors.forEach(d => {
        const id = uuidv4();
        batch.set(doc(adminDb, 'clinics', id), { 
            id, name: (d.Unidad || d.unidad || 'NUEVA UNIDAD').toUpperCase(),
            doctorName: (d.Médico || d.medico || d.Nombre || 'DR. POR ASIGNAR').toUpperCase(),
            professionalLicense: (d.Cédula || d.cedula || '').toUpperCase(),
            doctorCurp: (d.CURP || d.curp || '').toUpperCase(),
            serviceTypeId: d.Categoría || d.categoria || 'CONSULTA EXTERNA',
            dailySlots: 15, startTime: '08:00', endTime: '13:00', bookingMode: BookingMode.Time, weekendBookingEnabled: false
        });
    });
    await batch.commit(); return { success: true, processedCount: doctors.length }; 
}

// --- CATÁLOGOS ---
export async function getServiceTypesData() { return getRawCollection('serviceTypes'); }
export async function updateServiceTypes(t: any[]) { const batch = writeBatch(adminDb); t.forEach(x => batch.set(doc(adminDb, 'serviceTypes', x.id), x)); await batch.commit(); return { success: true }; }
export async function getSpecialtiesData() { return getRawCollection('specialties'); }
export async function updateSpecialties(t: any[]) { const batch = writeBatch(adminDb); t.forEach(x => batch.set(doc(adminDb, 'specialties', x.id), x)); await batch.commit(); return { success: true }; }
export async function getColoniasData() { return getRawCollection('colonias'); }
export async function updateColonias(c: Colonia[]) { const batch = writeBatch(adminDb); c.forEach(x => batch.set(doc(adminDb, 'colonias', x.id), x)); await batch.commit(); return { success: true }; }
export async function getHolidaysData() { return getRawCollection('holidays'); }
export async function updateHolidays(h: Holiday[]) { 
    const batch = writeBatch(adminDb); const snap = await getDocs(collection(adminDb, 'holidays')); 
    snap.docs.forEach(d => batch.delete(d.ref)); h.forEach(x => batch.set(doc(adminDb, 'holidays', uuidv4()), x)); 
    await batch.commit(); return { success: true }; 
}

export async function getLabSettings() { const d = await getDoc(doc(adminDb, 'settings', 'labSettings')); const p = await getPasswordFromStore('lab', 'lab2026'); return d.exists() ? { ...serializeData(d.data()), password: p } : { dailySlots: 20, waitlistSlots: 5, weekendBookingEnabled: false, password: p }; }
export async function updateLabSettings(s: LabSettings) { const { password, ...rest } = s; await setDoc(doc(adminDb, 'settings', 'labSettings'), rest); if (password) await setDoc(doc(adminDb, 'module_passwords', 'lab'), { password }); return { success: true }; }
export async function getXRaySettings() { const d = await getDoc(doc(adminDb, 'settings', 'xraySettings')); const p = await getPasswordFromStore('xray', 'rx2026'); return d.exists() ? { ...serializeData(d.data()), password: p } : { dailySlots: 10, waitlistSlots: 5, startTime: '08:00', endTime: '13:00', weekendBookingEnabled: false, password: p }; }
export async function updateXRaySettings(s: XRaySettings) { const { password, ...rest } = s; await setDoc(doc(adminDb, 'settings', 'xraySettings'), rest); if (password) await setDoc(doc(adminDb, 'module_passwords', 'xray'), { password }); return { success: true }; }
export async function getUltrasoundSettings() { const d = await getDoc(doc(adminDb, 'settings', 'ultrasoundSettings')); const p = await getPasswordFromStore('ultrasound', 'us2026'); return d.exists() ? { ...serializeData(d.data()), password: p } : { dailySlots: 10, waitlistSlots: 5, startTime: '08:00', endTime: '13:00', weekendBookingEnabled: false, password: p }; }
export async function updateUltrasoundSettings(s: UltrasoundSettings) { const { password, ...rest } = s; await setDoc(doc(adminDb, 'settings', 'ultrasoundSettings'), rest); if (password) await setDoc(doc(adminDb, 'module_passwords', 'ultrasound'), { password }); return { success: true }; }
export async function getVaccineSettings() { const d = await getDoc(doc(adminDb, 'settings', 'vaccineSettings')); const p = await getPasswordFromStore('vaccine', 'vac2026'); return d.exists() ? { ...serializeData(d.data()), password: p } : { dailySlots: 30, waitlistSlots: 10, startTime: '08:00', endTime: '13:00', weekendBookingEnabled: false, password: p }; }
export async function updateVaccineSettings(s: VaccineSettings) { const { password, ...rest } = s; await setDoc(doc(adminDb, 'settings', 'vaccineSettings'), rest); if (password) await setDoc(doc(adminDb, 'module_passwords', 'vaccine'), { password }); return { success: true }; }

export async function getLabStudies() { return getRawCollection('labStudies'); }
export async function updateLabStudies(s: LabStudy[]) { const batch = writeBatch(adminDb); const snap = await getDocs(collection(adminDb, 'labStudies')); snap.docs.forEach(d => batch.delete(d.ref)); s.forEach(x => batch.set(doc(adminDb, 'labStudies', x.id), x)); await batch.commit(); return { success: true }; }
export async function updateXRayStudies(s: XRayStudy[]) { const batch = writeBatch(adminDb); const snap = await getDocs(collection(adminDb, 'xrayStudies')); snap.docs.forEach(d => batch.delete(d.ref)); s.forEach(x => batch.set(doc(adminDb, 'xrayStudies', x.id), x)); await batch.commit(); return { success: true }; }
export async function updateUltrasoundStudies(s: UltrasoundStudy[]) { const batch = writeBatch(adminDb); const snap = await getDocs(collection(adminDb, 'ultrasoundStudies')); snap.docs.forEach(d => batch.delete(d.ref)); s.forEach(x => batch.set(doc(adminDb, 'ultrasoundStudies', x.id), x)); await batch.commit(); return { success: true }; }
export async function getVaccines() { return getRawCollection('vaccines'); }
export async function updateVaccines(v: Vaccine[]) { const batch = writeBatch(adminDb); const snap = await getDocs(collection(adminDb, 'vaccines')); snap.docs.forEach(d => batch.delete(d.ref)); v.forEach(x => batch.set(doc(adminDb, 'vaccines', x.id), x)); await batch.commit(); return { success: true }; }

// --- FARMACIA Y ALMACÉN ---
export async function getMedications() { return getRawCollection('medications', 10000); }
export async function getSupplies() { return getRawCollection('supplies', 10000); }

export async function bulkInsertMedications(items: any[]) {
    const batch = writeBatch(adminDb);
    items.forEach(item => {
        const fuzzy = fuzzyMapInsumo(item);
        const id = uuidv4();
        batch.set(doc(adminDb, 'medications', id), { ...fuzzy, id, updatedAt: new Date().toISOString() });
    });
    await batch.commit();
    return { success: true, processedCount: items.length };
}

export async function bulkInsertSupplies(items: any[]) {
    const batch = writeBatch(adminDb);
    items.forEach(item => {
        const fuzzy = fuzzyMapInsumo(item);
        const id = uuidv4();
        batch.set(doc(adminDb, 'supplies', id), { ...fuzzy, id, updatedAt: new Date().toISOString() });
    });
    await batch.commit();
    return { success: true, processedCount: items.length };
}

export async function deleteAllMedications() {
    const snap = await getDocs(collection(adminDb, 'medications'));
    const chunks: any[] = [];
    for (let i = 0; i < snap.docs.length; i += 500) chunks.push(snap.docs.slice(i, i + 500));
    for (const chunk of chunks) {
        const batch = writeBatch(adminDb);
        chunk.forEach((d: any) => batch.delete(d.ref));
        await batch.commit();
    }
    return { success: true };
}

export async function deleteAllSupplies() {
    const snap = await getDocs(collection(adminDb, 'supplies'));
    const chunks: any[] = [];
    for (let i = 0; i < snap.docs.length; i += 500) chunks.push(snap.docs.slice(i, i + 500));
    for (const chunk of chunks) {
        const batch = writeBatch(adminDb);
        chunk.forEach((d: any) => batch.delete(d.ref));
        await batch.commit();
    }
    return { success: true };
}

// --- CONSULTAS Y RECETAS ---
export async function getConsultationsByPatientId(pid: string) { const q = query(collection(adminDb, 'consultations'), where('patientId', '==', pid), limit(100)); const snap = await getDocs(q); return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })) as MedicalConsultation[]; }
export async function saveMedicalConsultation(c: any) { const id = c.id || uuidv4(); await setDoc(doc(adminDb, 'consultations', id), { ...c, id, createdAt: new Date().toISOString() }, { merge: true }); if (c.appointmentId) await updateDoc(doc(adminDb, 'appointments', c.appointmentId), { status: 'Atendido' }); return { success: true, id }; }
export async function deleteMedicalConsultation(id: string) { await deleteDoc(doc(adminDb, 'consultations', id)); return { success: true }; }
export async function getConsultationByAppointmentId(aid: string) { const q = query(collection(adminDb, 'consultations'), where('appointmentId', '==', aid), limit(1)); const snap = await getDocs(q); return snap.empty ? null : { ...serializeData(snap.docs[0].data()), id: snap.docs[0].id }; }
export async function createPrescription(p: any) { const id = uuidv4(); const folio = `REC-${Math.floor(1000 + Math.random() * 9000)}-${formatDate(new Date(), 'mmss')}`; const expiresAt = new Date(Date.now() + 86400000).toISOString(); const data = { ...p, id, folio, expiresAt, status: 'pendiente', createdAt: new Date().toISOString() }; await setDoc(doc(adminDb, 'prescriptions', id), data); return { success: true, folio, prescription: data }; }
export async function dispensePrescription(id: string, items: any[]) { const batch = writeBatch(adminDb); for (const item of items) { batch.update(doc(adminDb, 'medications', item.medicationId), { existencia: increment(-item.quantity) }); } batch.update(doc(adminDb, 'prescriptions', id), { status: 'surtida', dispensedAt: new Date().toISOString() }); await batch.commit(); return { success: true }; }
export async function deletePrescription(id: string) { await deleteDoc(doc(adminDb, 'prescriptions', id)); return { success: true }; }
export async function getPendingPrescriptions(f: any) { let q = query(collection(adminDb, 'prescriptions'), where('status', '==', 'pendiente'), limit(100)); if (f.folio) q = query(collection(adminDb, 'prescriptions'), where('folio', '==', f.folio.toUpperCase().trim())); const snap = await getDocs(q); return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })) as Prescription[]; }
export async function getPrescriptionHistory(f: any) { let q = query(collection(adminDb, 'prescriptions'), where('status', '==', 'surtida'), limit(500)); if (f.startDate) q = query(collection(adminDb, 'prescriptions'), where('date', '>=', f.startDate), where('date', '<=', f.endDate), limit(2000)); const snap = await getDocs(q); return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })) as Prescription[]; }
export async function getPrescriptionsByPatientId(pid: string) { const q = query(collection(adminDb, 'prescriptions'), where('patientId', '==', pid), limit(50)); const snap = await getDocs(q); return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })) as Prescription[]; }
export async function getPatientPrescriptionsCountTodayAction(pid: string) { const start = startOfDay(new Date()).toISOString(); const q = query(collection(adminDb, 'prescriptions'), where('patientId', '==', pid), where('date', '>=', start)); const snap = await getCountFromServer(q); return snap.data().count; }

// --- MANTENIMIENTO ---
export async function getAppointmentCountOnDate(cid: string, d: string) { const q = query(collection(adminDb, 'appointments'), where('clinicId', '==', cid), where('date', '>=', startOfDay(new Date(d + 'T00:00:00')).toISOString()), where('date', '<=', endOfDay(new Date(d + 'T23:59:59')).toISOString())); const snap = await getCountFromServer(q); return snap.data().count; }
export async function getAttendedPatientsForClinic(cid: string) { const q = query(collection(adminDb, 'appointments'), where('clinicId', '==', cid), where('status', '==', 'Atendido'), limit(100)); const snap = await getDocs(q); const pIds = Array.from(new Set(snap.docs.map(d => d.data().patientId))); if (pIds.length === 0) return []; const pats: any[] = []; for (let i = 0; i < pIds.length; i += 30) { const chunk = pIds.slice(i, i + 30); const pq = query(collection(adminDb, 'patients'), where('__name__', 'in', chunk)); const psnap = await getDocs(pq); pats.push(...psnap.docs.map(d => ({ ...serializeData(d.data()), id: d.id }))); } return pats; }
export async function rescheduleAppointment(id: string, date: string, type: string) { const coll = type === 'medical' ? 'appointments' : type === 'lab' ? 'labAppointments' : type === 'xray' ? 'xrayAppointments' : type === 'ultrasound' ? 'ultrasoundAppointments' : 'vaccineAppointments'; await updateDoc(doc(adminDb, coll, id), { date }); return { success: true, message: 'Fecha actualizada correctamente.' }; }
export async function cloneAppointment(id: string, date: string, type: string, time?: string) { const coll = type === 'medical' ? 'appointments' : type === 'lab' ? 'labAppointments' : type === 'xray' ? 'xrayAppointments' : type === 'ultrasound' ? 'ultrasoundAppointments' : 'vaccineAppointments'; const snap = await getDoc(doc(adminDb, coll, id)); if (!snap.exists()) return { success: false, message: 'Cita original no encontrada.' }; const old = snap.data(); const nid = uuidv4(); const folio = `FOL-${Math.floor(1000 + Math.random() * 9000)}-CLON`; await setDoc(doc(adminDb, coll, nid), { ...old, id: nid, date, appointmentNumber: folio, status: 'Agendada', createdAt: new Date().toISOString(), time: time || old.time }); return { success: true, message: `Nueva cita asignada con folio ${folio}` }; }
export async function cleanupOldRecords() { const prevMonth = startOfMonth(new Date(Date.now() - 30 * 86400000)).toISOString(); const collections = ['appointments', 'labAppointments', 'xrayAppointments', 'ultrasoundAppointments', 'vaccineAppointments', 'activityLog']; let total = 0; for (const coll of collections) { const q = query(collection(adminDb, coll), where('date', '<', prevMonth)); const snap = await getDocs(q); const batch = writeBatch(adminDb); snap.docs.forEach(d => { batch.delete(d.ref); total++; }); await batch.commit(); } return { success: true, deletedCount: total }; }
export async function downloadBackupAction() { const [appointments, labAppointments, xRayAppointments, ultrasoundAppointments, vaccineAppointments, patients, clinics] = await Promise.all([getRawCollection('appointments'), getRawCollection('labAppointments'), getRawCollection('xrayAppointments'), getRawCollection('ultrasoundAppointments'), getRawCollection('vaccineAppointments'), getRawCollection('patients'), getRawCollection('clinics')]); return { success: true, data: { appointments, labAppointments, xRayAppointments, ultrasoundAppointments, vaccineAppointments, patients, clinics } }; }
export async function searchCie10(t: string): Promise<Cie10Record[]> { const colRef = collection(adminDb, 'cie10'); const term = t.toUpperCase().trim(); let q = query(colRef, where('catalogKey', '==', term), limit(1)); let snap = await getDocs(q); if (!snap.empty) return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })) as Cie10Record[]; q = query(colRef, where('nombre', '>=', term), where('nombre', '<=', term + '\uf8ff'), limit(20)); snap = await getDocs(q); return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })) as Cie10Record[]; }
export async function getBIData() { const [appointments, labAppointments, xRayAppointments, ultrasoundAppointments, vaccineAppointments, clinics, colonias] = await Promise.all([getRawCollection('appointments'), getRawCollection('labAppointments'), getRawCollection('xrayAppointments'), getRawCollection('ultrasoundAppointments'), getRawCollection('vaccineAppointments'), getClinicsData(), getRawCollection('colonias')]); return { appointments, labAppointments, xRayAppointments, ultrasoundAppointments, vaccineAppointments, clinics, colonias }; }
export async function getAvailableSlotsForDate(cid: string, date: string) { const clinics = await getClinicsData(); const clinic = clinics.find(c => c.id === cid); if (!clinic) return { timeSlots: [] }; const dayDate = new Date(date); const dateOnly = dayDate.toISOString().split('T')[0]; const apps = await getRawCollection('appointments'); const dayApps = apps.filter(a => a.clinicId === cid && a.date.split('T')[0] === dateOnly); const bookedTimes = dayApps.map(a => a.time); if (clinic.bookingMode === BookingMode.Token) { const total = (clinic.dailySlots || 15) + (clinic.waitlistSlots || 0); const tokens = Array.from({ length: total }, (_, i) => i + 1).filter(t => !bookedTimes.includes(`Ficha ${t}`)); return { tokens }; } else { const custom = clinic.customSchedules?.find(s => s.date === dateOnly); const endTime = custom ? custom.endTime : clinic.endTime; const slots: string[] = []; const start = new Date(`1970-01-01T${clinic.startTime}:00`); const end = new Date(`1970-01-01T${endTime}:00`); let curr = start; while (curr < end) { const t = curr.toTimeString().substring(0, 5); if (t !== clinic.breakTime && !bookedTimes.includes(t)) slots.push(t); curr = new Date(curr.getTime() + (clinic.consultationDuration || 30) * 60000); } return { timeSlots: slots }; } }
export async function applyStatusUpdateChunk(expedientes: string[], status: PatientStatus) { const colRef = collection(adminDb, 'patients'); let updatedCount = 0; const batch = writeBatch(adminDb); for (const exp of expedientes) { const q = query(colRef, where('expediente', '==', exp), limit(1)); const snap = await getDocs(q); if (!snap.empty) { batch.update(snap.docs[0].ref, { status }); updatedCount++; } else { const withZero = exp.startsWith('0') ? exp : '0' + exp; const q2 = query(colRef, where('expediente', '==', withZero), limit(1)); const snap2 = await getDocs(q2); if (!snap2.empty) { batch.update(snap2.docs[0].ref, { status }); updatedCount++; } } } await batch.commit(); return { success: true, count: updatedCount }; }
export async function scanDuplicates(criteria: 'expediente' | 'curp' | 'name') { const patients = await getRawCollection('patients', 10000); const groups = new Map<string, Patient[]>(); patients.forEach(p => { let key = ''; if (criteria === 'expediente') key = String(p.expediente || ''); else if (criteria === 'curp') key = String(p.curp || ''); else key = `${p.name} ${p.paternalLastName}`.toUpperCase(); if (!key) return; if (!groups.has(key)) groups.set(key, []); groups.get(key)!.push(p as Patient); }); return Array.from(groups.values()).filter(g => g.length > 1); }
export async function normalizeExpedientesAction() { const patients = await getRawCollection('patients', 10000); const batch = writeBatch(adminDb); let count = 0; patients.forEach(p => { const exp = String(p.expediente || ''); if (exp && !exp.startsWith('0')) { batch.update(doc(adminDb, 'patients', p.id), { expediente: '0' + exp }); count++; } }); await batch.commit(); return { success: true, count }; }
export async function getSpecialActionDaysData() { return getRawCollection('specialActionDays'); }
export async function updateSpecialActionDays(items: SpecialActionDay[]) { const batch = writeBatch(adminDb); const snap = await getDocs(collection(adminDb, 'specialActionDays')); snap.docs.forEach(d => batch.delete(d.ref)); items.forEach(x => batch.set(doc(adminDb, 'specialActionDays', uuidv4()), x)); await batch.commit(); return { success: true }; }

export async function getArchiveSettingsData() { const snap = await getDoc(doc(adminDb, 'module_passwords', 'archive')); return { password: snap.exists() ? snap.data().password : '2026' }; }
export async function updateArchiveSettings(s: any) { await setDoc(doc(adminDb, 'module_passwords', 'archive'), { password: s.password }); return { success: true }; }
export async function getPharmacySettingsData() { const snap = await getDoc(doc(adminDb, 'module_passwords', 'pharmacy')); return { password: snap.exists() ? snap.data().password : 'farmacia2026' }; }
export async function updatePharmacySettings(s: any) { await setDoc(doc(adminDb, 'module_passwords', 'pharmacy'), { password: s.password }); return { success: true }; }
export async function getWarehouseSettingsData() { const snap = await getDoc(doc(adminDb, 'module_passwords', 'warehouse')); return { password: snap.exists() ? snap.data().password : 'almacen2026' }; }
export async function updateWarehouseSettings(s: any) { await setDoc(doc(adminDb, 'module_passwords', 'warehouse'), { password: s.password }); return { success: true }; }
export async function getBISettingsData() { const snap = await getDoc(doc(adminDb, 'module_passwords', 'bi')); return { password: snap.exists() ? snap.data().password : 'bi2026' }; }
export async function updateBISettings(s: any) { await setDoc(doc(adminDb, 'module_passwords', 'bi'), { password: s.password }); return { success: true }; }
export async function getAdminSettingsData() { const snap = await getDoc(doc(adminDb, 'module_passwords', 'superadmin')); return { password: snap.exists() ? snap.data().password : 'Hu1m4ngu1ll0' }; }
export async function updateAdminSettings(s: any) { await setDoc(doc(adminDb, 'module_passwords', 'superadmin'), { password: s.password }); return { success: true }; }
export async function getAnnouncementsData() { const snap = await getDoc(doc(adminDb, 'settings', 'announcements')); return snap.exists() ? snap.data().messages : []; }
export async function updateAnnouncements(m: string[]) { await setDoc(doc(adminDb, 'settings', 'announcements'), { messages: m }); return { success: true }; }
