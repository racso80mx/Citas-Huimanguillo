
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

// --- MOTOR DE MAPEO ESPECÍFICO PARA ESTRUCTURA DEL USUARIO ---
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
        } else if (typeof cadVal === 'string') {
            const s = cadVal.trim();
            if (s) {
                let d = parse(s, 'dd/MM/yyyy', new Date());
                if (!isValid(d)) d = parse(s, 'yyyy-MM-dd', new Date());
                if (!isValid(d)) d = new Date(s);
                formattedCaducidad = isValid(d) ? formatDateFns(d, 'dd/MM/yyyy') : s.toUpperCase();
            }
        }
    }

    return {
        claveCuadroBasico: String(findValue('CLAVE DE CUADRO BASICO') || findValue('CLAVE') || 'S/C'),
        descripcion: String(findValue('DESCRIPCIÓN') || findValue('DESCRIPCION') || 'SIN DESCRIPCIÓN').toUpperCase(),
        grupo: String(findValue('GRUPO') || '').toUpperCase(),
        existencia: Number(findValue('EXISTENCIA') || 0),
        precioUnitario: Number(findValue('PRECIO UNITARIO') || 0),
        totalImporte: Number(findValue('TOTAL IMPORTE') || 0),
        lote: String(findValue('LOTE') || 'N/A').toUpperCase(),
        proveedor: String(findValue('PROVEEDOR') || '').toUpperCase(),
        rfcProveedor: String(findValue('RFC PROVEEDOR') || '').toUpperCase(),
        almacen: String(findValue('ALMACEN') || '').toUpperCase(),
        fuenteFinanciamiento: String(findValue('FUENTE FINANCIAMIENTO') || '').toUpperCase(),
        fechaCaducidad: formattedCaducidad,
        ordenSuministro: String(findValue('ORDEN SUMINISTRO') || '').toUpperCase(),
        tipoInsumo: String(findValue('TIPO_INSUMO') || '').toUpperCase(),
        numeroContrato: String(findValue('NUMERO DE CONTRATO') || '').toUpperCase()
    };
}

// --- EXPORTACIONES DE COLECCIONES GENÉRICAS ---
export async function getRawCollection(collectionName: string, limitNum: number = 200) {
    const snap = await getDocs(query(collection(adminDb, collectionName), limit(limitNum)));
    return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id }));
}

// --- LOGS ---
export async function logActivity(action: string, details: string) {
    await addDoc(collection(adminDb, 'activityLog'), { action, details, timestamp: new Date().toISOString() });
    return { success: true };
}

export async function getLogsData() {
    const q = query(collection(adminDb, 'activityLog'), orderBy('timestamp', 'desc'), limit(500));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id }));
}

// --- CONFIGURACIÓN ---
export async function getPasswordFromStore(id: string, def: string): Promise<string> {
    const s = await getDoc(doc(adminDb, 'module_passwords', id));
    return s.exists() ? s.data().password : def;
}

export async function getModuleSettings(): Promise<ModuleSettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'moduleSettings'));
    const base = s.exists() ? serializeData(s.data()) as ModuleSettings : {
        citasMedicasEnabled: true, laboratorioEnabled: true, rayosXEnabled: true, ultrasoundEnabled: true, vacunasEnabled: true,
        archivoEnabled: true, farmaciaEnabled: true, almacenEnabled: true, archivoConsultaEnabled: true,
        citasMedicasWhatsAppEnabled: true, laboratorioWhatsAppEnabled: true, rayosXWhatsAppEnabled: true, ultrasoundWhatsAppEnabled: true, vacunasWhatsAppEnabled: true, archivoWhatsAppEnabled: true
    };
    const [c, co] = await Promise.all([getPasswordFromStore('medical', 'citas2026'), getPasswordFromStore('archiveInquiry', '2026')]);
    return { ...base, citasMedicasPassword: c, archivoConsultaPassword: co };
}

export async function updateModuleSettings(s: ModuleSettings) {
    const { citasMedicasPassword, archivoConsultaPassword, ...rest } = s;
    const b = writeBatch(adminDb);
    b.set(doc(adminDb, 'settings', 'moduleSettings'), rest);
    if (citasMedicasPassword) b.set(doc(adminDb, 'module_passwords', 'medical'), { password: citasMedicasPassword });
    if (archivoConsultaPassword) b.set(doc(adminDb, 'module_passwords', 'archiveInquiry'), { password: archivoConsultaPassword });
    await b.commit();
    return { success: true };
}

// --- PACIENTES ---
export async function getPatientsData(options?: any): Promise<Patient[]> {
    const colRef = collection(adminDb, 'patients');
    let q;
    if (options?.searchCurp) {
        q = query(colRef, where('curp', '==', options.searchCurp.toUpperCase().trim()), limit(1));
    } else if (options?.searchExpediente) {
        q = query(colRef, where('expediente', '==', options.searchExpediente), limit(50));
    } else if (options?.searchName) {
        q = query(colRef, where('name', '>=', options.searchName.toUpperCase()), limit(50));
    } else {
        q = query(colRef, limit(options?.limitNum || 150));
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

export async function savePatient(p: Omit<Patient, 'id'>, id: string) { await setDoc(doc(adminDb, 'patients', id), { ...p, id }); return { success: true }; }
export async function updatePatient(id: string, p: Partial<Patient>) { await updateDoc(doc(adminDb, 'patients', id), p); return { success: true }; }
export async function deletePatient(id: string) { await deleteDoc(doc(adminDb, 'patients', id)); return { success: true }; }
export async function deletePatients(ids: string[]) { const b = writeBatch(adminDb); ids.forEach(id => b.delete(doc(adminDb, 'patients', id))); await b.commit(); return { success: true }; }
export async function updatePatientStatus(id: string, s: string) { await updateDoc(doc(adminDb, 'patients', id), { status: s }); return { success: true }; }
export async function getPatientByCURP(c: string) { const q = query(collection(adminDb, 'patients'), where('curp', '==', c.toUpperCase()), limit(1)); const s = await getDocs(q); return s.empty ? { success: false } : { success: true, data: { ...serializeData(s.docs[0].data()), id: s.docs[0].id } }; }

export async function bulkInsertPatients(patients: any[]) {
    const batch = writeBatch(adminDb);
    let count = 0;
    for (const p of patients) {
        const curp = String(p.CURP || p.curp || '').toUpperCase().trim();
        if (!curp) continue;
        batch.set(doc(adminDb, 'patients', curp), { ...p, id: curp, curp, status: PatientStatus.Vigente }, { merge: true });
        count++;
    }
    await batch.commit();
    return { success: true, processedCount: count, addedCount: count, updatedCount: 0 };
}

// --- CITAS ---
export async function getAppointmentsData() { const snap = await getDocs(query(collection(adminDb, 'appointments'), limit(1000))); return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function getLabAppointmentsData() { const snap = await getDocs(query(collection(adminDb, 'labAppointments'), limit(500))); return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function getXRayAppointmentsData() { const snap = await getDocs(query(collection(adminDb, 'xrayAppointments'), limit(500))); return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function getUltrasoundAppointmentsData() { const snap = await getDocs(query(collection(adminDb, 'ultrasoundAppointments'), limit(500))); return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function getVaccineAppointmentsData() { const snap = await getDocs(query(collection(adminDb, 'vaccineAppointments'), limit(500))); return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }

export async function deleteAppointment(id: string) { await deleteDoc(doc(adminDb, 'appointments', id)); return { success: true }; }
export async function deleteLabAppointment(id: string) { await deleteDoc(doc(adminDb, 'labAppointments', id)); return { success: true }; }
export async function deleteXRayAppointment(id: string) { await deleteDoc(doc(adminDb, 'xrayAppointments', id)); return { success: true }; }
export async function deleteUltrasoundAppointment(id: string) { await deleteDoc(doc(adminDb, 'ultrasoundAppointments', id)); return { success: true }; }
export async function deleteVaccineAppointment(id: string) { await deleteDoc(doc(adminDb, 'vaccineAppointments', id)); return { success: true }; }

export async function updateAppointmentStatus(aid: string, s: string, type: string) {
    const coll = type === 'medical' ? 'appointments' : type === 'lab' ? 'labAppointments' : type === 'xray' ? 'xrayAppointments' : type === 'ultrasound' ? 'ultrasoundAppointments' : 'vaccineAppointments';
    await updateDoc(doc(adminDb, coll, aid), { status: s });
    return { success: true };
}

export async function rescheduleAppointment(id: string, date: string, type: string) {
    const coll = type === 'medical' ? 'appointments' : type === 'lab' ? 'labAppointments' : type === 'xray' ? 'xrayAppointments' : type === 'ultrasound' ? 'ultrasoundAppointments' : 'vaccineAppointments';
    await updateDoc(doc(adminDb, coll, id), { date });
    return { success: true, message: 'Cita reprogramada.' };
}

export async function cloneAppointment(id: string, date: string, type: string, time?: string) {
    const coll = type === 'medical' ? 'appointments' : type === 'lab' ? 'labAppointments' : type === 'xray' ? 'xrayAppointments' : type === 'ultrasound' ? 'ultrasoundAppointments' : 'vaccineAppointments';
    const s = await getDoc(doc(adminDb, coll, id));
    if (!s.exists()) return { success: false, message: 'Cita no encontrada.' };
    const nid = uuidv4();
    await setDoc(doc(adminDb, coll, nid), { ...s.data(), id: nid, date, appointmentNumber: `CLON-${uuidv4().substring(0,4)}`, status: 'Agendada', createdAt: new Date().toISOString(), time: time || s.data().time });
    return { success: true, message: 'Cita clonada.' };
}

export async function saveNewAppointment(a: any, p: any, isD: boolean, c?: string) { const id = uuidv4(); await setDoc(doc(adminDb, 'appointments', id), { ...a, id, patientId: p.curp, coloniaName: c, createdAt: new Date().toISOString() }); await setDoc(doc(adminDb, 'patients', p.curp), { ...p, id: p.curp }, { merge: true }); return { success: true, data: { appointment: { ...a, patient: p }, clinic: { name: 'CONSULTORIO' } } }; }
export async function saveNewLabAppointment(a: any, p: any) { const id = uuidv4(); await setDoc(doc(adminDb, 'labAppointments', id), { ...a, id, patientId: p.curp, createdAt: new Date().toISOString() }); await setDoc(doc(adminDb, 'patients', p.curp), { ...p, id: p.curp }, { merge: true }); return { success: true, data: { ...a, patient: p } }; }
export async function saveNewXRayAppointment(a: any, p: any) { const id = uuidv4(); await setDoc(doc(adminDb, 'xrayAppointments', id), { ...a, id, patientId: p.curp, createdAt: new Date().toISOString() }); await setDoc(doc(adminDb, 'patients', p.curp), { ...p, id: p.curp }, { merge: true }); return { success: true, data: { appointment: { ...a, patient: p }, study: { name: a.studyName, indications: '' } } }; }
export async function saveNewUltrasoundAppointment(a: any, p: any) { const id = uuidv4(); await setDoc(doc(adminDb, 'ultrasoundAppointments', id), { ...a, id, patientId: p.curp, createdAt: new Date().toISOString() }); await setDoc(doc(adminDb, 'patients', p.curp), { ...p, id: p.curp }, { merge: true }); return { success: true, data: { appointment: { ...a, patient: p }, study: { name: a.studyName, indications: '' } } }; }
export async function saveNewVaccineAppointment(a: any, p: any) { const id = uuidv4(); await setDoc(doc(adminDb, 'vaccineAppointments', id), { ...a, id, patientId: p.curp, createdAt: new Date().toISOString() }); await setDoc(doc(adminDb, 'patients', p.curp), { ...p, id: p.curp }, { merge: true }); return { success: true, data: { ...a, patient: p } }; }

export async function getAppointmentsForClinic(cid: string) { const q = query(collection(adminDb, 'appointments'), where('clinicId', '==', cid), limit(300)); const s = await getDocs(q); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }

// --- CLÍNICAS Y DOCTORES ---
export async function getClinicsData(): Promise<Clinic[]> { const snap = await getDocs(collection(adminDb, 'clinics')); return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id } as Clinic)); }
export async function updateClinics(c: Clinic[]) { const b = writeBatch(adminDb); c.forEach(x => b.set(doc(adminDb, 'clinics', x.id), x)); await b.commit(); return { success: true }; }
export async function deleteClinic(id: string) { await deleteDoc(doc(adminDb, 'clinics', id)); return { success: true }; }
export async function bulkInsertDoctors(d: any[]) { const b = writeBatch(adminDb); d.forEach(x => b.set(doc(adminDb, 'clinics', uuidv4()), x)); await b.commit(); return { success: true, processedCount: d.length }; }

// --- FARMACIA Y ALMACÉN ---
export async function bulkInsertMedications(json: any[]) {
    const b = writeBatch(adminDb);
    let count = 0;
    json.forEach(item => {
        const med = fuzzyMapInsumo(item);
        const id = med.claveCuadroBasico + '_' + med.lote;
        b.set(doc(adminDb, 'medications', id), { ...med, id, updatedAt: new Date().toISOString() }, { merge: true });
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
        const id = med.claveCuadroBasico + '_' + med.lote;
        b.set(doc(adminDb, 'supplies', id), { ...med, id, updatedAt: new Date().toISOString() }, { merge: true });
        count++;
    });
    await b.commit();
    return { success: true, processedCount: count };
}

export async function getMedications() { const snap = await getDocs(query(collection(adminDb, 'medications'), limit(1000))); return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })) as Medication[]; }
export async function getSupplies() { const snap = await getDocs(query(collection(adminDb, 'supplies'), limit(1000))); return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })) as Supply[]; }
export async function deleteAllMedications() { const s = await getDocs(collection(adminDb, 'medications')); const b = writeBatch(adminDb); s.docs.forEach(d => b.delete(d.ref)); await b.commit(); return { success: true }; }
export async function deleteAllSupplies() { const s = await getDocs(collection(adminDb, 'supplies')); const b = writeBatch(adminDb); s.docs.forEach(d => b.delete(d.ref)); await b.commit(); return { success: true }; }

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
export async function getPatientPrescriptionsCountTodayAction(pid: string) { const s = startOfDay(new Date()).toISOString(); const q = query(collection(adminDb, 'prescriptions'), where('patientId', '==', pid), where('date', '>=', s)); const snap = await getCountFromServer(q); return snap.data().count; }

// --- CONFIGURACIÓN ESPECÍFICA ---
export async function getArchiveSettingsData() { const p = await getPasswordFromStore('archive', '2026'); return { password: p }; }
export async function getPharmacySettingsData() { const p = await getPasswordFromStore('pharmacy', 'farmacia2026'); return { password: p }; }
export async function getWarehouseSettingsData() { const p = await getPasswordFromStore('warehouse', 'almacen2026'); return { password: p }; }
export async function getBISettingsData() { const p = await getPasswordFromStore('bi', 'bi2026'); return { password: p }; }
export async function getAdminSettingsData() { const p = await getPasswordFromStore('superadmin', 'Hu1m4ngu1ll0'); return { password: p }; }

export async function updateAdminSettings(s: any) { await setDoc(doc(adminDb, 'module_passwords', 'superadmin'), { password: s.password }); return { success: true }; }
export async function updateArchiveSettings(s: any) { await setDoc(doc(adminDb, 'module_passwords', 'archive'), { password: s.password }); return { success: true }; }
export async function updatePharmacySettings(s: any) { await setDoc(doc(adminDb, 'module_passwords', 'pharmacy'), { password: s.password }); return { success: true }; }
export async function updateWarehouseSettings(s: any) { await setDoc(doc(adminDb, 'module_passwords', 'warehouse'), { password: s.password }); return { success: true }; }
export async function updateBISettings(s: any) { await setDoc(doc(adminDb, 'module_passwords', 'bi'), { password: s.password }); return { success: true }; }

export async function getLabSettings() { const s = await getDoc(doc(adminDb, 'settings', 'labSettings')); return s.exists() ? serializeData(s.data()) as LabSettings : { dailySlots: 10, waitlistSlots: 0, weekendBookingEnabled: false, startTime: '08:00', endTime: '13:00' }; }
export async function getXRaySettings() { const s = await getDoc(doc(adminDb, 'settings', 'xraySettings')); return s.exists() ? serializeData(s.data()) as XRaySettings : { dailySlots: 10, waitlistSlots: 0, weekendBookingEnabled: false, startTime: '08:00', endTime: '13:00' }; }
export async function getUltrasoundSettings() { const s = await getDoc(doc(adminDb, 'settings', 'ultrasoundSettings')); return s.exists() ? serializeData(s.data()) as UltrasoundSettings : { dailySlots: 10, waitlistSlots: 0, weekendBookingEnabled: false, startTime: '08:00', endTime: '13:00' }; }
export async function getVaccineSettings() { const s = await getDoc(doc(adminDb, 'settings', 'vaccineSettings')); return s.exists() ? serializeData(s.data()) as VaccineSettings : { dailySlots: 10, waitlistSlots: 0, weekendBookingEnabled: false, startTime: '08:00', endTime: '13:00' }; }

export async function updateLabSettings(s: LabSettings) { await setDoc(doc(adminDb, 'settings', 'labSettings'), s); return { success: true }; }
export async function updateXRaySettings(s: XRaySettings) { await setDoc(doc(adminDb, 'settings', 'xraySettings'), s); return { success: true }; }
export async function updateUltrasoundSettings(s: UltrasoundSettings) { await setDoc(doc(adminDb, 'settings', 'ultrasoundSettings'), s); return { success: true }; }
export async function updateVaccineSettings(s: VaccineSettings) { await setDoc(doc(adminDb, 'settings', 'vaccineSettings'), s); return { success: true }; }

export async function getLabStudies() { const snap = await getDocs(query(collection(adminDb, 'labStudies'), limit(500))); return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })) as LabStudy[]; }
export async function updateLabStudies(s: LabStudy[]) { const b = writeBatch(adminDb); const snap = await getDocs(collection(adminDb, 'labStudies')); snap.docs.forEach(d => b.delete(d.ref)); s.forEach(x => b.set(doc(adminDb, 'labStudies', x.id), x)); await b.commit(); return { success: true }; }
export async function updateXRayStudies(s: XRayStudy[]) { const b = writeBatch(adminDb); const snap = await getDocs(collection(adminDb, 'xrayStudies')); snap.docs.forEach(d => b.delete(d.ref)); s.forEach(x => b.set(doc(adminDb, 'xrayStudies', x.id), x)); await b.commit(); return { success: true }; }
export async function updateUltrasoundStudies(s: UltrasoundStudy[]) { const b = writeBatch(adminDb); const snap = await getDocs(collection(adminDb, 'ultrasoundStudies')); snap.docs.forEach(d => b.delete(d.ref)); s.forEach(x => b.set(doc(adminDb, 'ultrasoundStudies', x.id), x)); await b.commit(); return { success: true }; }
export async function updateVaccines(v: Vaccine[]) { const b = writeBatch(adminDb); const snap = await getDocs(collection(adminDb, 'vaccines')); snap.docs.forEach(d => b.delete(d.ref)); v.forEach(x => b.set(doc(adminDb, 'vaccines', x.id), x)); await b.commit(); return { success: true }; }

export async function getServiceTypesData() { const snap = await getDocs(query(collection(adminDb, 'serviceTypes'), limit(200))); return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateServiceTypes(t: any[]) { const b = writeBatch(adminDb); t.forEach(x => b.set(doc(adminDb, 'serviceTypes', x.id), x)); await b.commit(); return { success: true }; }
export async function getSpecialtiesData() { const snap = await getDocs(query(collection(adminDb, 'specialties'), limit(200))); return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateSpecialties(t: any[]) { const b = writeBatch(adminDb); t.forEach(x => b.set(doc(adminDb, 'specialties', x.id), x)); await b.commit(); return { success: true }; }
export async function getColoniasData() { const snap = await getDocs(query(collection(adminDb, 'colonias'), limit(1000))); return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateColonias(c: Colonia[]) { const b = writeBatch(adminDb); c.forEach(x => b.set(doc(adminDb, 'colonias', x.id), x)); await b.commit(); return { success: true }; }
export async function getAnnouncementsData() { const d = await getDoc(doc(adminDb, 'settings', 'announcements')); return d.exists() ? d.data().messages || [] : []; }
export async function updateAnnouncements(m: string[]) { await setDoc(doc(adminDb, 'settings', 'announcements'), { messages: m }); return { success: true }; }
export async function getHolidaysData() { const snap = await getDocs(query(collection(adminDb, 'holidays'), limit(200))); return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateHolidays(h: Holiday[]) { const b = writeBatch(adminDb); h.forEach(x => b.set(doc(adminDb, 'holidays', x.date), x)); await b.commit(); return { success: true }; }
export async function getSpecialActionDaysData() { const snap = await getDocs(query(collection(adminDb, 'specialActionDays'), limit(200))); return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateSpecialActionDays(i: SpecialActionDay[]) { const b = writeBatch(adminDb); i.forEach(x => b.set(doc(adminDb, 'specialActionDays', x.date + '_' + x.clinicType), x)); await b.commit(); return { success: true }; }

export async function verifyModulePassword(m: string, p: string) { const pass = await getPasswordFromStore(m, ''); return { success: pass === p }; }
export async function verifyClinicPassword(id: string, p: string) { const s = await getDoc(doc(adminDb, 'clinics', id)); return { success: s.exists() && s.data().password === p }; }

export async function getBIData() {
    const [a, l, x, u, v, c, cl] = await Promise.all([
        getDocs(query(collection(adminDb, 'appointments'), limit(500))),
        getDocs(query(collection(adminDb, 'labAppointments'), limit(200))),
        getDocs(query(collection(adminDb, 'xrayAppointments'), limit(200))),
        getDocs(query(collection(adminDb, 'ultrasoundAppointments'), limit(200))),
        getDocs(query(collection(adminDb, 'vaccineAppointments'), limit(200))),
        getClinicsData(),
        getDocs(query(collection(adminDb, 'colonias'), limit(500)))
    ]);
    return { 
        appointments: a.docs.map(d => serializeData(d.data())), 
        labAppointments: l.docs.map(d => serializeData(d.data())), 
        xRayAppointments: x.docs.map(d => serializeData(d.data())), 
        ultrasoundAppointments: u.docs.map(d => serializeData(d.data())), 
        vaccineAppointments: v.docs.map(d => serializeData(d.data())), 
        clinics: c, 
        colonias: cl.docs.map(d => serializeData(d.data())) 
    };
}

export async function searchCie10(term: string) { const q = query(collection(adminDb, 'cie10Catalog'), where('nombre', '>=', term.toUpperCase()), limit(20)); const s = await getDocs(q); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })) as Cie10Record[]; }
export async function getAvailableSlotsForDate(cid: string, d: string) { return { timeSlots: [], tokens: [] }; }
export async function getAppointmentCountOnDate(cid: string, d: string) { const dOnly = d.split('T')[0]; const q = query(collection(adminDb, 'appointments'), where('clinicId', '==', cid), where('date', '>=', dOnly), where('date', '<=', dOnly + 'T23:59:59')); const s = await getCountFromServer(q); return s.data().count; }
export async function getAttendedPatientsForClinic(cid: string) { const q = query(collection(adminDb, 'appointments'), where('clinicId', '==', cid), where('status', '==', 'Atendido'), limit(200)); const s = await getDocs(q); return s.docs.map(d => ({ ...serializeData(d.data().patient), id: d.data().patientId })); }

// --- MANTENIMIENTO ---
export async function cleanupOldRecords() { const t = subDays(new Date(), 30).toISOString(); const q = query(collection(adminDb, 'activityLog'), where('timestamp', '<', t), limit(500)); const s = await getDocs(q); const b = writeBatch(adminDb); s.docs.forEach(d => b.delete(d.ref)); await b.commit(); return { success: true, deletedCount: s.size }; }
export async function downloadBackupAction() { const [p, c, a] = await Promise.all([getDocs(query(collection(adminDb, 'patients'), limit(2000))), getDocs(query(collection(adminDb, 'clinics'), limit(100))), getDocs(query(collection(adminDb, 'appointments'), limit(1000)))]); return { success: true, data: { patients: p.docs.map(d => serializeData(d.data())), clinics: c.docs.map(d => serializeData(d.data())), appointments: a.docs.map(d => serializeData(d.data())), labAppointments: [], xrayAppointments: [], ultrasoundAppointments: [], vaccineAppointments: [] } }; }
export async function normalizeExpedientesAction() { const s = await getDocs(query(collection(adminDb, 'patients'), limit(500))); const b = writeBatch(adminDb); let count = 0; s.docs.forEach(d => { const e = String(d.data().expediente || ''); if (e && !e.startsWith('0')) { b.update(d.ref, { expediente: '0' + e }); count++; } }); await b.commit(); return { success: true, count }; }
export async function scanDuplicates(criteria: string) { const p = await getDocs(query(collection(adminDb, 'patients'), limit(1000))); const g = new Map<string, Patient[]>(); p.docs.forEach(d => { const x = d.data(); let k = criteria === 'expediente' ? String(x.expediente || '') : criteria === 'curp' ? String(x.curp || '') : `${x.name} ${x.paternalLastName}`.toUpperCase(); if (!k) return; if (!g.has(k)) g.set(k, []); g.get(k)!.push(x as Patient); }); return Array.from(g.values()).filter(x => x.length > 1); }
export async function applyStatusUpdateChunk(exps: string[], s: PatientStatus) { const b = writeBatch(adminDb); let count = 0; for (const e of exps) { const q = query(collection(adminDb, 'patients'), where('expediente', '==', e), limit(1)); const snap = await getDocs(q); if (!snap.empty) { b.update(snap.docs[0].ref, { status: s }); count++; } } await b.commit(); return { success: true, count }; }
