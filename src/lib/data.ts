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
  Cie10Record
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

// --- MOTOR DE MAPEO (EXCEL) ---
function fuzzyMapInsumo(item: any) {
    const keys = Object.keys(item);
    
    // Normalizador de texto para búsqueda flexible
    const normalize = (s: string) => String(s || '').toLowerCase().trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, '');
        
    const findValue = (options: string[]) => {
        // PRIORIDAD ABSOLUTA: Buscar el nombre exacto que el usuario reporta
        const exactMatch = keys.find(k => k.trim().toUpperCase() === 'FECHA CADUCIDAD');
        if (exactMatch && options.includes('caducidad')) return item[exactMatch];

        const normalizedOptions = options.map(normalize);
        const foundKey = keys.find(k => normalizedOptions.includes(normalize(k)));
        return foundKey ? item[foundKey] : undefined;
    };

    const cadVal = findValue(['caducidad', 'fechacaducidad', 'vencimiento', 'vence', 'venc', 'expiracion']);
    
    let formattedCaducidad = 'SIN FECHA';
    if (cadVal !== undefined && cadVal !== null) {
        if (isDate(cadVal)) {
            formattedCaducidad = formatDateFns(cadVal as Date, 'dd/MM/yyyy');
        } else if (typeof cadVal === 'number' && cadVal > 30000) {
            const excelEpoch = new Date(1899, 11, 30);
            const d = new Date(excelEpoch.getTime() + cadVal * 86400000);
            if (isValid(d)) formattedCaducidad = formatDateFns(d, 'dd/MM/yyyy');
        } else if (typeof cadVal === 'string') {
            const s = cadVal.trim();
            if (s) {
                let d = parse(s, 'dd/MM/yyyy', new Date());
                if (!isValid(d)) d = new Date(s);
                if (!isValid(d)) d = parse(s, 'yyyy-MM-dd', new Date());
                formattedCaducidad = isValid(d) ? formatDateFns(d, 'dd/MM/yyyy') : s.toUpperCase();
            }
        }
    }

    return {
        claveCuadroBasico: String(findValue(['clave', 'articulo', 'codigo']) || 'S/C'),
        descripcion: String(findValue(['descripcion', 'nombre', 'insumo']) || 'SIN DESCRIPCIÓN').toUpperCase(),
        existencia: Number(findValue(['existencia', 'stock', 'cantidad']) || 0),
        fechaCaducidad: formattedCaducidad,
        lote: String(findValue(['lote', 'loteo']) || 'N/A').toUpperCase(),
        grupo: String(findValue(['grupo', 'categoria']) || '').toUpperCase(),
        precioUnitario: Number(findValue(['precio', 'costo']) || 0),
        almacen: String(findValue(['almacen', 'unidad']) || '').toUpperCase(),
        totalImporte: 0,
        proveedor: '',
        rfcProveedor: '',
        fuenteFinanciamiento: '',
        ordenSuministro: '',
        tipoInsumo: '',
        numeroContrato: ''
    };
}

// --- ACCIONES DE SERVIDOR ---
export async function logActivity(action: string, details: string) {
    await addDoc(collection(adminDb, 'activityLog'), { action, details, timestamp: new Date().toISOString() });
    return { success: true };
}

export async function getLogsData() {
    const q = query(collection(adminDb, 'activityLog'), orderBy('timestamp', 'desc'), limit(500));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id }));
}

export async function getRawCollection(name: string, limitNum: number = 200) {
    const q = query(collection(adminDb, name), limit(limitNum));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id }));
}

export async function getClinicsData(): Promise<Clinic[]> {
    const snap = await getDocs(collection(adminDb, 'clinics'));
    return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id } as Clinic));
}

export async function getAppointmentsData(): Promise<Appointment[]> {
    const recentDate = subDays(new Date(), 30).toISOString();
    const q = query(collection(adminDb, 'appointments'), where('date', '>=', recentDate), limit(300));
    const snap = await getDocs(q);
    const apps = snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id }));
    const pIds = Array.from(new Set(apps.map(a => a.patientId).filter(id => !!id)));
    if (pIds.length === 0) return apps as Appointment[];
    const pats: any[] = [];
    for (let i = 0; i < pIds.length; i += 30) {
        const chunk = pIds.slice(i, i + 30);
        const psnap = await getDocs(query(collection(adminDb, 'patients'), where('__name__', 'in', chunk)));
        psnap.docs.forEach(d => pats.push({ ...serializeData(d.data()), id: d.id }));
    }
    return apps.map(a => ({ ...a, patient: pats.find(p => p.id === a.patientId) })) as Appointment[];
}

export async function deleteAppointment(id: string) { await deleteDoc(doc(adminDb, 'appointments', id)); return { success: true }; }
export async function deleteLabAppointment(id: string) { await deleteDoc(doc(adminDb, 'labAppointments', id)); return { success: true }; }
export async function deleteXRayAppointment(id: string) { await deleteDoc(doc(adminDb, 'xrayAppointments', id)); return { success: true }; }
export async function deleteUltrasoundAppointment(id: string) { await deleteDoc(doc(adminDb, 'ultrasoundAppointments', id)); return { success: true }; }
export async function deleteVaccineAppointment(id: string) { await deleteDoc(doc(adminDb, 'vaccineAppointments', id)); return { success: true }; }

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

export async function getPatientsData(options?: any): Promise<Patient[]> {
    const colRef = collection(adminDb, 'patients');
    if (options?.searchCurp) {
        const q = query(colRef, where('curp', '==', options.searchCurp.toUpperCase().trim()), limit(1));
        const s = await getDocs(q);
        return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })) as Patient[];
    }
    const q = query(colRef, limit(50));
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

export async function getMedications() { return getRawCollection('medications', 1000); }
export async function getSupplies() { return getRawCollection('supplies', 1000); }
export async function deleteAllMedications() { const s = await getDocs(collection(adminDb, 'medications')); const b = writeBatch(adminDb); s.docs.forEach(d => b.delete(d.ref)); await b.commit(); return { success: true }; }
export async function deleteAllSupplies() { const s = await getDocs(collection(adminDb, 'supplies')); const b = writeBatch(adminDb); s.docs.forEach(d => b.delete(d.ref)); await b.commit(); return { success: true }; }

export async function getBIData() {
    const [a, l, x, u, v, c, col] = await Promise.all([
        getRawCollection('appointments', 500), getRawCollection('labAppointments', 200),
        getRawCollection('xrayAppointments', 200), getRawCollection('ultrasoundAppointments', 200),
        getRawCollection('vaccineAppointments', 200), getClinicsData(), getRawCollection('colonias', 500)
    ]);
    return { appointments: a, labAppointments: l, xRayAppointments: x, ultrasoundAppointments: u, vaccineAppointments: v, clinics: c, colonias: col };
}

export async function searchCie10(t: string): Promise<Cie10Record[]> {
    const term = t.toUpperCase().trim();
    const q = query(collection(adminDb, 'cie10'), where('catalogKey', '==', term), limit(1));
    const s = await getDocs(q);
    if (!s.empty) return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })) as Cie10Record[];
    const q2 = query(collection(adminDb, 'cie10'), where('nombre', '>=', term), where('nombre', '<=', term + '\uf8ff'), limit(20));
    const s2 = await getDocs(q2);
    return s2.docs.map(d => ({ ...serializeData(d.data()), id: d.id })) as Cie10Record[];
}

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

export async function getServiceTypesData() { return getRawCollection('serviceTypes'); }
export async function getSpecialtiesData() { return getRawCollection('specialties'); }
export async function getHolidaysData() { return getRawCollection('holidays'); }
export async function getSpecialActionDaysData() { return getRawCollection('specialActionDays'); }
export async function updateHolidays(h: Holiday[]) { const b = writeBatch(adminDb); const s = await getDocs(collection(adminDb, 'holidays')); s.docs.forEach(d => b.delete(d.ref)); h.forEach(x => b.set(doc(adminDb, 'holidays', uuidv4()), x)); await b.commit(); return { success: true }; }
export async function updateSpecialActionDays(i: SpecialActionDay[]) { const b = writeBatch(adminDb); const s = await getDocs(collection(adminDb, 'specialActionDays')); s.docs.forEach(d => b.delete(d.ref)); i.forEach(x => b.set(doc(adminDb, 'specialActionDays', uuidv4()), x)); await b.commit(); return { success: true }; }
export async function updateServiceTypes(t: any[]) { const b = writeBatch(adminDb); t.forEach(x => b.set(doc(adminDb, 'serviceTypes', x.id), x)); await b.commit(); return { success: true }; }
export async function updateSpecialties(t: any[]) { const b = writeBatch(adminDb); t.forEach(x => b.set(doc(adminDb, 'specialties', x.id), x)); await b.commit(); return { success: true }; }
export async function updateColonias(c: Colonia[]) { const b = writeBatch(adminDb); c.forEach(x => b.set(doc(adminDb, 'colonias', x.id), x)); await b.commit(); return { success: true }; }
export async function getAnnouncementsData() { const s = await getDoc(doc(adminDb, 'settings', 'announcements')); return s.exists() ? s.data().messages : []; }
export async function updateAnnouncements(m: string[]) { await setDoc(doc(adminDb, 'settings', 'announcements'), { messages: m }); return { success: true }; }

export async function saveMedicalConsultation(c: any) { const id = c.id || uuidv4(); await setDoc(doc(adminDb, 'consultations', id), { ...c, id, createdAt: new Date().toISOString() }, { merge: true }); if (c.appointmentId) await updateDoc(doc(adminDb, 'appointments', c.appointmentId), { status: 'Atendido' }); return { success: true, id }; }
export async function deleteMedicalConsultation(id: string) { await deleteDoc(doc(adminDb, 'consultations', id)); return { success: true }; }
export async function getConsultationByAppointmentId(aid: string) { const q = query(collection(adminDb, 'consultations'), where('appointmentId', '==', aid), limit(1)); const snap = await getDocs(q); return snap.empty ? null : { ...serializeData(snap.docs[0].data()), id: snap.docs[0].id }; }
export async function getConsultationsByPatientId(pid: string) { const q = query(collection(adminDb, 'consultations'), where('patientId', '==', pid), limit(50)); const snap = await getDocs(q); return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })) as MedicalConsultation[]; }
export async function createPrescription(p: any) { const id = uuidv4(); const f = `REC-${Math.floor(1000 + Math.random() * 9000)}-${formatDateFns(new Date(), 'mmss')}`; const data = { ...p, id, folio: f, status: 'pendiente', createdAt: new Date().toISOString() }; await setDoc(doc(adminDb, 'prescriptions', id), data); return { success: true, folio: f, prescription: data }; }
export async function dispensePrescription(id: string, items: any[]) { const batch = writeBatch(adminDb); for (const item of items) { batch.update(doc(adminDb, 'medications', item.medicationId), { existencia: increment(-item.quantity) }); } batch.update(doc(adminDb, 'prescriptions', id), { status: 'surtida', dispensedAt: new Date().toISOString() }); await batch.commit(); return { success: true }; }
export async function getPendingPrescriptions(f: any) { let q = query(collection(adminDb, 'prescriptions'), where('status', '==', 'pendiente'), limit(20)); if (f.folio) q = query(collection(adminDb, 'prescriptions'), where('folio', '==', f.folio.toUpperCase().trim())); const snap = await getDocs(q); return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })) as Prescription[]; }
export async function getPrescriptionHistory(f: any) { let q = query(collection(adminDb, 'prescriptions'), where('status', '==', 'surtida'), limit(100)); if (f.startDate) q = query(collection(adminDb, 'prescriptions'), where('date', '>=', f.startDate), where('date', '<=', f.endDate), limit(500)); const snap = await getDocs(q); return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })) as Prescription[]; }
export async function getPrescriptionsByPatientId(pid: string) { const q = query(collection(adminDb, 'prescriptions'), where('patientId', '==', pid), limit(20)); const snap = await getDocs(q); return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id })) as Prescription[]; }
export async function getPatientPrescriptionsCountTodayAction(pid: string) { const s = startOfDay(new Date()).toISOString(); const q = query(collection(adminDb, 'prescriptions'), where('patientId', '==', pid), where('date', '>=', s)); const snap = await getCountFromServer(q); return snap.data().count; }

export async function rescheduleAppointment(id: string, date: string, type: string) {
    const coll = type === 'medical' ? 'appointments' : type === 'lab' ? 'labAppointments' : type === 'xray' ? 'xrayAppointments' : type === 'ultrasound' ? 'ultrasoundAppointments' : 'vaccineAppointments';
    await updateDoc(doc(adminDb, coll, id), { date });
    return { success: true, message: 'Cita reprogramada.' };
}

export async function cloneAppointment(id: string, date: string, type: string, time?: string) {
    const coll = type === 'medical' ? 'appointments' : type === 'lab' ? 'labAppointments' : type === 'xray' ? 'xrayAppointments' : type === 'ultrasound' ? 'ultrasoundAppointments' : 'vaccineAppointments';
    const s = await getDoc(doc(adminDb, coll, id));
    if (!s.exists()) return { success: false, message: 'Cita no encontrada.' };
    const nid = uuidv4(); const f = `FOL-${Math.floor(1000 + Math.random() * 9000)}-CLON`;
    await setDoc(doc(adminDb, coll, nid), { ...s.data(), id: nid, date, appointmentNumber: f, status: 'Agendada', createdAt: new Date().toISOString(), time: time || s.data().time });
    return { success: true, message: `Nueva cita: ${f}` };
}

export async function getAppointmentCountOnDate(cid: string, d: string) {
    const dOnly = d.split('T')[0];
    const q = query(collection(adminDb, 'appointments'), where('clinicId', '==', cid), where('date', '>=', dOnly), where('date', '<=', dOnly + 'T23:59:59'));
    const s = await getCountFromServer(q);
    return s.data().count;
}

export async function getAttendedPatientsForClinic(cid: string) {
    const q = query(collection(adminDb, 'appointments'), where('clinicId', '==', cid), where('status', '==', 'Atendido'), limit(200));
    const s = await getDocs(q);
    const pIds = Array.from(new Set(s.docs.map(d => d.data().patientId)));
    if (pIds.length === 0) return [];
    const pats: any[] = [];
    for (let i = 0; i < pIds.length; i += 30) {
        const chunk = pIds.slice(i, i + 30);
        const pq = query(collection(adminDb, 'patients'), where('__name__', 'in', chunk));
        const ps = await getDocs(pq);
        ps.docs.forEach(d => pats.push({ ...serializeData(d.data()), id: d.id }));
    }
    return pats;
}

export async function normalizeExpedientesAction() {
    const s = await getDocs(query(collection(adminDb, 'patients'), limit(500)));
    const b = writeBatch(adminDb); let count = 0;
    s.docs.forEach(d => {
        const e = String(d.data().expediente || '');
        if (e && !e.startsWith('0')) { b.update(d.ref, { expediente: '0' + e }); count++; }
    });
    await b.commit(); return { success: true, count };
}

export async function scanDuplicates(criteria: string) {
    const p = await getRawCollection('patients', 1000);
    const g = new Map<string, Patient[]>();
    p.forEach(x => {
        let k = '';
        if (criteria === 'expediente') k = String(x.expediente || '');
        else if (criteria === 'curp') k = String(x.curp || '');
        else k = `${x.name} ${x.paternalLastName}`.toUpperCase();
        if (!k) return;
        if (!g.has(k)) g.set(k, []); g.get(k)!.push(x as Patient);
    });
    return Array.from(g.values()).filter(x => x.length > 1);
}

export async function applyStatusUpdateChunk(exps: string[], s: PatientStatus) {
    const b = writeBatch(adminDb); let count = 0;
    for (const e of exps) {
        const q = query(collection(adminDb, 'patients'), where('expediente', '==', e), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) { b.update(snap.docs[0].ref, { status: s }); count++; }
    }
    await b.commit(); return { success: true, count };
}

export async function updateAppointmentStatus(aid: string, s: string, type: string) {
    const coll = type === 'medical' ? 'appointments' : type === 'lab' ? 'labAppointments' : type === 'xray' ? 'xrayAppointments' : type === 'ultrasound' ? 'ultrasoundAppointments' : 'vaccineAppointments';
    await updateDoc(doc(adminDb, coll, aid), { status: s });
    return { success: true };
}

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

export async function getLabStudies() { return getRawCollection('labStudies', 500); }
export async function updateLabStudies(s: LabStudy[]) { const b = writeBatch(adminDb); const snap = await getDocs(collection(adminDb, 'labStudies')); snap.docs.forEach(d => b.delete(d.ref)); s.forEach(x => b.set(doc(adminDb, 'labStudies', x.id), x)); await b.commit(); return { success: true }; }
export async function updateXRayStudies(s: XRayStudy[]) { const b = writeBatch(adminDb); const snap = await getDocs(collection(adminDb, 'xrayStudies')); snap.docs.forEach(d => b.delete(d.ref)); s.forEach(x => b.set(doc(adminDb, 'xrayStudies', x.id), x)); await b.commit(); return { success: true }; }
export async function updateUltrasoundStudies(s: UltrasoundStudy[]) { const b = writeBatch(adminDb); const snap = await getDocs(collection(adminDb, 'ultrasoundStudies')); snap.docs.forEach(d => b.delete(d.ref)); s.forEach(x => b.set(doc(adminDb, 'ultrasoundStudies', x.id), x)); await b.commit(); return { success: true }; }

export async function getAvailableSlotsForDate(cid: string, d: string) {
    const clinics = await getClinicsData(); const clinic = clinics.find(c => c.id === cid);
    if (!clinic) return { timeSlots: [] }; const dateOnly = d.split('T')[0];
    const snap = await getDocs(query(collection(adminDb, 'appointments'), where('clinicId', '==', cid), where('date', '>=', dateOnly), where('date', '<=', dateOnly + 'T23:59:59')));
    const booked = snap.docs.map(x => x.data().time);
    if (clinic.bookingMode === BookingMode.Token) {
        const total = (clinic.dailySlots || 15) + (clinic.waitlistSlots || 0);
        const tokens = Array.from({ length: total }, (_, i) => i + 1).filter(t => !booked.includes(`Ficha ${t}`));
        return { tokens };
    } else {
        const custom = clinic.customSchedules?.find(s => s.date === dateOnly);
        const end = custom ? custom.endTime : clinic.endTime; const slots: string[] = [];
        const sTime = new Date(`1970-01-01T${clinic.startTime}:00`);
        const eTime = new Date(`1970-01-01T${end}:00`); let curr = sTime;
        while (curr < eTime) {
            const t = curr.toTimeString().substring(0, 5);
            if (t !== clinic.breakTime && !booked.includes(t)) slots.push(t);
            curr = new Date(curr.getTime() + (clinic.consultationDuration || 30) * 60000);
        }
        return { timeSlots: slots };
    }
}

export async function updateClinics(c: Clinic[]) { const b = writeBatch(adminDb); c.forEach(x => b.set(doc(adminDb, 'clinics', x.id), x)); await b.commit(); return { success: true }; }
export async function deleteClinic(id: string) { await deleteDoc(doc(adminDb, 'clinics', id)); return { success: true }; }
export async function bulkInsertDoctors(d: any[]) { const b = writeBatch(adminDb); d.forEach(x => b.set(doc(adminDb, 'clinics', uuidv4()), x)); await b.commit(); return { success: true, processedCount: d.length }; }

export async function updatePatient(id: string, p: Partial<Patient>) { await updateDoc(doc(adminDb, 'patients', id), p); return { success: true }; }
export async function savePatient(p: Omit<Patient, 'id'>, id: string) { await setDoc(doc(adminDb, 'patients', id), { ...p, id }); return { success: true }; }
export async function updatePatientStatus(id: string, s: string) { await updateDoc(doc(adminDb, 'patients', id), { status: s }); return { success: true }; }
export async function deletePatient(id: string) { await deleteDoc(doc(adminDb, 'patients', id)); return { success: true }; }
export async function deletePatients(ids: string[]) { const b = writeBatch(adminDb); ids.forEach(id => b.delete(doc(adminDb, 'patients', id))); await b.commit(); return { success: true }; }
export async function getPatientByCURP(c: string) { const q = query(collection(adminDb, 'patients'), where('curp', '==', c.toUpperCase()), limit(1)); const s = await getDocs(q); return s.empty ? { success: false } : { success: true, data: { ...serializeData(s.docs[0].data()), id: s.docs[0].id } }; }

export async function getLabSettings() { const s = await getDoc(doc(adminDb, 'settings', 'labSettings')); return s.exists() ? serializeData(s.data()) as LabSettings : { dailySlots: 10, waitlistSlots: 0, weekendBookingEnabled: false, startTime: '08:00', endTime: '13:00' }; }
export async function updateLabSettings(s: LabSettings) { await setDoc(doc(adminDb, 'settings', 'labSettings'), s); return { success: true }; }
export async function getXRaySettings() { const s = await getDoc(doc(adminDb, 'settings', 'xraySettings')); return s.exists() ? serializeData(s.data()) as XRaySettings : { dailySlots: 10, waitlistSlots: 0, weekendBookingEnabled: false, startTime: '08:00', endTime: '13:00' }; }
export async function updateXRaySettings(s: XRaySettings) { await setDoc(doc(adminDb, 'settings', 'xraySettings'), s); return { success: true }; }
export async function getUltrasoundSettings() { const s = await getDoc(doc(adminDb, 'settings', 'ultrasoundSettings')); return s.exists() ? serializeData(s.data()) as UltrasoundSettings : { dailySlots: 10, waitlistSlots: 0, weekendBookingEnabled: false, startTime: '08:00', endTime: '13:00' }; }
export async function updateUltrasoundSettings(s: UltrasoundSettings) { await setDoc(doc(adminDb, 'settings', 'ultrasoundSettings'), s); return { success: true }; }
export async function getVaccineSettings() { const s = await getDoc(doc(adminDb, 'settings', 'vaccineSettings')); return s.exists() ? serializeData(s.data()) as VaccineSettings : { dailySlots: 10, waitlistSlots: 0, weekendBookingEnabled: false, startTime: '08:00', endTime: '13:00' }; }
export async function updateVaccineSettings(s: VaccineSettings) { await setDoc(doc(adminDb, 'settings', 'vaccineSettings'), s); return { success: true }; }
export async function updateVaccines(v: Vaccine[]) { const b = writeBatch(adminDb); const snap = await getDocs(collection(adminDb, 'vaccines')); snap.docs.forEach(d => b.delete(d.ref)); v.forEach(x => b.set(doc(adminDb, 'vaccines', x.id), x)); await b.commit(); return { success: true }; }

export async function verifyModulePassword(m: string, p: string) { const pass = await getPasswordFromStore(m, ''); return { success: pass === p }; }
export async function verifyClinicPassword(id: string, p: string) { const s = await getDoc(doc(adminDb, 'clinics', id)); return { success: s.exists() && s.data().password === p }; }

export async function saveNewAppointment(a: any, p: any, isD: boolean, c?: string) { const id = uuidv4(); const f = `FOL-${Math.floor(1000 + Math.random() * 9000)}-${formatDateFns(new Date(), 'mmss')}`; await setDoc(doc(adminDb, 'appointments', id), { ...a, id, appointmentNumber: f, patientId: p.curp, coloniaName: c, createdAt: new Date().toISOString() }); await setDoc(doc(adminDb, 'patients', p.curp), { ...p, id: p.curp }, { merge: true }); return { success: true, data: { appointment: { ...a, appointmentNumber: f, patient: p }, clinic: { name: 'CONSULTORIO' } } }; }
export async function saveNewLabAppointment(a: any, p: any) { const id = uuidv4(); await setDoc(doc(adminDb, 'labAppointments', id), { ...a, id, patientId: p.curp, createdAt: new Date().toISOString() }); await setDoc(doc(adminDb, 'patients', p.curp), { ...p, id: p.curp }, { merge: true }); return { success: true, data: { ...a, patient: p } }; }
export async function saveNewXRayAppointment(a: any, p: any) { const id = uuidv4(); await setDoc(doc(adminDb, 'xrayAppointments', id), { ...a, id, patientId: p.curp, createdAt: new Date().toISOString() }); await setDoc(doc(adminDb, 'patients', p.curp), { ...p, id: p.curp }, { merge: true }); return { success: true, data: { appointment: { ...a, patient: p }, study: { name: a.studyName, indications: '' } } }; }
export async function saveNewUltrasoundAppointment(a: any, p: any) { const id = uuidv4(); await setDoc(doc(adminDb, 'ultrasoundAppointments', id), { ...a, id, patientId: p.curp, createdAt: new Date().toISOString() }); await setDoc(doc(adminDb, 'patients', p.curp), { ...p, id: p.curp }, { merge: true }); return { success: true, data: { appointment: { ...a, patient: p }, study: { name: a.studyName, indications: '' } } }; }
export async function saveNewVaccineAppointment(a: any, p: any) { const id = uuidv4(); await setDoc(doc(adminDb, 'vaccineAppointments', id), { ...a, id, patientId: p.curp, createdAt: new Date().toISOString() }); await setDoc(doc(adminDb, 'patients', p.curp), { ...p, id: p.curp }, { merge: true }); return { success: true, data: { ...a, patient: p } }; }

export async function downloadBackupAction() {
    const [p, c, a, l, x, u, v] = await Promise.all([
        getRawCollection('patients', 2000), getRawCollection('clinics', 100),
        getRawCollection('appointments', 1000), getRawCollection('labAppointments', 500),
        getRawCollection('xrayAppointments', 500), getRawCollection('ultrasoundAppointments', 500),
        getRawCollection('vaccineAppointments', 500)
    ]);
    return { success: true, data: { patients: p, clinics: c, appointments: a, labAppointments: l, xRayAppointments: x, ultrasoundAppointments: u, vaccineAppointments: v } };
}

export async function cleanupOldRecords() {
    const thirtyDaysAgo = subDays(new Date(), 30).toISOString();
    const q = query(collection(adminDb, 'activityLog'), where('timestamp', '<', thirtyDaysAgo), limit(500));
    const s = await getDocs(q); const b = writeBatch(adminDb);
    s.docs.forEach(d => b.delete(d.ref)); await b.commit();
    return { success: true, deletedCount: s.size };
}
