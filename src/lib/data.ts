
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
  orderBy,
  or
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
  Cie10Record,
  MedicalConsultation
} from './definitions';
import { PatientStatus, BookingMode } from './definitions';
import { v4 as uuidv4 } from 'uuid';
import { startOfDay, subDays } from 'date-fns';

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

// --- MOTOR DE HIDRATACIÓN PROFUNDA (ELIMINA LOS N/A) ---
async function hydrateAppointments(appointments: any[]) {
    if (!appointments || appointments.length === 0) return [];
    
    const patientIds = Array.from(new Set(appointments.map(a => a.patientId).filter(Boolean)));
    if (patientIds.length === 0) return serializeData(appointments);

    const patientsMap: Record<string, any> = {};
    const CHUNK_SIZE = 30;
    for (let i = 0; i < patientIds.length; i += CHUNK_SIZE) {
        const chunk = patientIds.slice(i, i + CHUNK_SIZE);
        const q = query(collection(adminDb, 'patients'), where('__name__', 'in', chunk));
        const snap = await getDocs(q);
        snap.forEach(d => {
            patientsMap[d.id] = { ...d.data(), id: d.id };
        });
    }

    return appointments.map(app => {
        const patientData = patientsMap[app.patientId] || app.patient || { 
            name: 'PACIENTE', 
            paternalLastName: 'NO ENCONTRADO', 
            curp: app.patientId || 'S/C', 
            phoneNumber: 'N/A' 
        };
        return {
            ...serializeData(app),
            patient: serializeData(patientData)
        };
    });
}

// --- MÓDULOS Y CONFIGURACIÓN ---
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
        citasMedicasPassword: 'citas2026',
        archivoConsultaPassword: '2026'
    };
}

export async function updateModuleSettings(s: ModuleSettings) {
    await setDoc(doc(adminDb, 'settings', 'moduleSettings'), s);
    return { success: true };
}

// --- VERIFICACIONES DE SEGURIDAD ---
export async function verifyModulePassword(moduleId: string, input: string) {
    const settings = await getModuleSettings();
    let pass = '123';
    
    if (moduleId === 'medical') pass = settings.citasMedicasPassword || 'citas2026';
    else if (moduleId === 'archive') {
        const arch = await getArchiveSettings();
        pass = arch.password || '2026';
    } else if (moduleId === 'superadmin') {
        const adm = await getAdminSettingsData();
        pass = adm.password || 'Hu1m4ngu1ll0';
    } else if (moduleId === 'pharmacy') {
        const ph = await getPharmacySettings();
        pass = ph.password || 'farmacia2026';
    } else if (moduleId === 'warehouse') {
        const wh = await getWarehouseSettings();
        pass = wh.password || 'almacen2026';
    } else if (moduleId === 'bi') {
        const bi = await getBISettings();
        pass = bi.password || 'bi2026';
    } else if (moduleId === 'lab') {
        const lab = await getLabSettings();
        pass = lab.password || '123';
    } else if (moduleId === 'xray') {
        const xr = await getXRaySettings();
        pass = xr.password || '123';
    } else if (moduleId === 'ultrasound') {
        const us = await getUltrasoundSettings();
        pass = us.password || '123';
    } else if (moduleId === 'vaccine') {
        const vac = await getVaccineSettings();
        pass = vac.password || '123';
    }
    
    const success = pass === input;
    return { success, message: !success ? 'Contraseña incorrecta.' : undefined };
}

export async function verifyClinicPassword(clinicId: string, input: string) {
    const snap = await getDoc(doc(adminDb, 'clinics', clinicId));
    if (!snap.exists()) return { success: false, message: 'La unidad no existe.' };
    const pass = snap.data().password;
    return { success: pass === input, message: pass !== input ? 'Contraseña incorrecta.' : undefined };
}

// --- PACIENTES (SMART SEARCH GLOBAL) ---
export async function getPatientsData(options?: any): Promise<Patient[]> {
    const colRef = collection(adminDb, 'patients');
    
    if (options?.searchCurp) {
        const s = await getDocs(query(colRef, where('curp', '==', options.searchCurp.toUpperCase().trim()), limit(1)));
        if (!s.empty) return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id })));
    }
    if (options?.searchExpediente) {
        const s = await getDocs(query(colRef, where('expediente', '==', options.searchExpediente.trim()), limit(1)));
        if (!s.empty) return serializeData(s.docs.map(d => ({ ...d.data(), id: d.id })));
    }

    if (options?.searchName) {
        const term = options.searchName.toUpperCase().trim();
        const words = term.split(/\s+/).filter((w:string) => w.length >= 2);
        
        if (words.length > 0) {
            const firstWord = words[0];
            const queries = [
                query(colRef, where('name', '>=', firstWord), where('name', '<=', firstWord + '\uf8ff'), limit(500)),
                query(colRef, where('paternalLastName', '>=', firstWord), where('paternalLastName', '<=', firstWord + '\uf8ff'), limit(500)),
                query(colRef, where('maternalLastName', '>=', firstWord), where('maternalLastName', '<=', firstWord + '\uf8ff'), limit(500))
            ];
            
            const snaps = await Promise.all(queries.map(q => getDocs(q)));
            let combined = new Map<string, Patient>();
            snaps.forEach(s => s.docs.forEach(d => combined.set(d.id, { ...d.data(), id: d.id } as Patient)));
            
            let results = Array.from(combined.values());
            if (words.length > 1) {
                results = results.filter(p => {
                    const full = `${p.name} ${p.paternalLastName} ${p.maternalLastName}`.toUpperCase();
                    return words.every(w => full.includes(w));
                });
            }
            if (options.status && options.status !== 'Total') {
                results = results.filter(p => p.status === options.status);
            }
            return serializeData(results.slice(0, 200));
        }
    }

    let qBase = query(colRef, orderBy('paternalLastName'), limit(options?.limitNum || 100));
    if (options?.status && options.status !== 'Total') {
        qBase = query(colRef, where('status', '==', options.status), orderBy('paternalLastName'), limit(options?.limitNum || 100));
    }
    
    const snap = await getDocs(qBase);
    return serializeData(snap.docs.map(d => ({ ...d.data(), id: d.id })));
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

// --- CITAS (VISIBILIDAD TOTAL - LÍMITE 10,000) ---
export async function getAppointmentsData() { 
    const snap = await getDocs(query(collection(adminDb, 'appointments'), orderBy('date', 'desc'), limit(10000))); 
    return hydrateAppointments(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getAppointmentsForClinic(cid: string) {
    const q = query(collection(adminDb, 'appointments'), where('clinicId', '==', cid), orderBy('date', 'desc'), limit(5000));
    const snap = await getDocs(q);
    return hydrateAppointments(snap.docs.map(d => ({ ...d.data(), id: d.id })));
}

export async function getAppointmentCountOnDate(cid: string, d: string) {
    const dOnly = d.split('T')[0];
    const q = query(collection(adminDb, 'appointments'), where('clinicId', '==', cid), where('date', '>=', dOnly), where('date', '<=', dOnly + 'T23:59:59'));
    const snap = await getCountFromServer(q);
    return snap.data().count;
}

export async function updateAppointmentStatus(id: string, status: string, type: any) {
    const coll = type === 'lab' ? 'labAppointments' : type === 'xray' ? 'xrayAppointments' : type === 'ultrasound' ? 'ultrasoundAppointments' : type === 'vaccine' ? 'vaccineAppointments' : 'appointments';
    await updateDoc(doc(adminDb, coll, id), { status });
    return { success: true };
}

// --- CONFIGURACIÓN DE SEGURIDAD INDEPENDIENTE ---
export async function getAdminSettingsData(): Promise<AdminSettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'adminSettings'));
    return s.exists() ? serializeData(s.data()) : { password: 'Hu1m4ngu1ll0' };
}
export async function updateAdminSettings(s: AdminSettings) { await setDoc(doc(adminDb, 'settings', 'adminSettings'), s); return { success: true }; }

export async function getArchiveSettings(): Promise<ArchiveSettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'archiveSettings'));
    return s.exists() ? serializeData(s.data()) : { password: '2026' };
}
export async function updateArchiveSettings(s: ArchiveSettings) { await setDoc(doc(adminDb, 'settings', 'archiveSettings'), s); return { success: true }; }

export async function getPharmacySettings(): Promise<PharmacySettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'pharmacySettings'));
    return s.exists() ? serializeData(s.data()) : { password: 'farmacia2026' };
}
export async function updatePharmacySettings(s: PharmacySettings) { await setDoc(doc(adminDb, 'settings', 'pharmacySettings'), s); return { success: true }; }

export async function getWarehouseSettings(): Promise<WarehouseSettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'warehouseSettings'));
    return s.exists() ? serializeData(s.data()) : { password: 'almacen2026' };
}
export async function updateWarehouseSettings(s: WarehouseSettings) { await setDoc(doc(adminDb, 'settings', 'warehouseSettings'), s); return { success: true }; }

export async function getBISettings(): Promise<BISettings> {
    const s = await getDoc(doc(adminDb, 'settings', 'biSettings'));
    return s.exists() ? serializeData(s.data()) : { password: 'bi2026' };
}
export async function updateBISettings(s: BISettings) { await setDoc(doc(adminDb, 'settings', 'biSettings'), s); return { success: true }; }

export async function getLogsData() {
    const snap = await getDocs(query(collection(adminDb, 'activityLog'), orderBy('timestamp', 'desc'), limit(500)));
    return snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id }));
}

export async function logActivity(action: string, details: string) {
    await addDoc(collection(adminDb, 'activityLog'), { timestamp: Timestamp.now(), action, details });
    return { success: true };
}

// --- CRUD PACIENTES ---
export async function savePatient(p: Omit<Patient, 'id'>, id: string) { 
    const finalId = id || p.curp; 
    await setDoc(doc(adminDb, 'patients', finalId), { ...p, id: finalId }); 
    return { success: true }; 
}
export async function updatePatient(id: string, p: Partial<Patient>) { await updateDoc(doc(adminDb, 'patients', id), p); return { success: true }; }
export async function updatePatientStatus(id: string, status: string) { await updateDoc(doc(adminDb, 'patients', id), { status }); return { success: true }; }
export async function deletePatient(id: string) { await deleteDoc(doc(adminDb, 'patients', id)); return { success: true }; }
export async function deletePatients(ids: string[]) { 
    const b = writeBatch(adminDb); 
    ids.forEach(id => b.delete(doc(adminDb, 'patients', id))); 
    await b.commit(); 
    return { success: true }; 
}

export async function getPatientByCURP(c: string) {
    const s = await getDocs(query(collection(adminDb, 'patients'), where('curp', '==', c.toUpperCase()), limit(1)));
    return s.empty ? { success: false } : { success: true, data: serializeData({ ...s.docs[0].data(), id: s.docs[0].id }) };
}

export async function bulkInsertPatients(patients: any[]) {
    const batch = writeBatch(adminDb);
    let count = 0;
    for (const p of patients) {
        const curp = String(p.CURP || p.curp || '').toUpperCase().trim();
        if (!curp) continue;
        batch.set(doc(adminDb, 'patients', curp), {
            id: curp, curp, 
            name: String(p.Nombre || p.name || '').toUpperCase().trim(),
            paternalLastName: String(p.Apaterno || p.paternalLastName || '').toUpperCase().trim(),
            maternalLastName: String(p.Amaterno || p.maternalLastName || '').toUpperCase().trim(),
            expediente: String(p['No.Expediente'] || p.expediente || '').trim(),
            status: p.Estatus || p.status || PatientStatus.Vigente,
            phoneNumber: String(p.Telefono || p.phoneNumber || '').trim(),
            age: Number(p.Edad || p.age || 0), 
            sex: String(p.Sexo || p.sex || 'Hombre'),
            birthDate: String(p.FNacimiento || p.birthDate || ''), 
            address: String(p.Domicilio || p.address || ''),
            coloniaName: String(p.Colonia || p.coloniaName || '')
        }, { merge: true });
        count++;
    }
    await batch.commit();
    return { success: true, processedCount: count };
}

// --- DISPONIBILIDAD ---
export async function getAvailableSlotsForDate(cid: string, d: string) {
    const dOnly = d.split('T')[0];
    const clinicSnap = await getDoc(doc(adminDb, 'clinics', cid));
    if (!clinicSnap.exists()) return {};
    const clinic = clinicSnap.data();
    const bookedSnap = await getDocs(query(collection(adminDb, 'appointments'), where('clinicId', '==', cid), where('date', '>=', dOnly), where('date', '<=', dOnly + 'T23:59:59')));
    const bookedTimes = bookedSnap.docs.map(d => d.data().time);
    if (clinic.bookingMode === 'token') {
        const total = (clinic.dailySlots || 15) + (clinic.waitlistSlots || 0);
        return { tokens: Array.from({ length: total }, (_, i) => i + 1).filter(t => !bookedTimes.includes(`Ficha ${t}`)) };
    }
    return { timeSlots: [] }; 
}

export async function deleteAppointment(id: string) { await deleteDoc(doc(adminDb, 'appointments', id)); return { success: true }; }
export async function deleteLabAppointment(id: string) { await deleteDoc(doc(adminDb, 'labAppointments', id)); return { success: true }; }
export async function deleteXRayAppointment(id: string) { await deleteDoc(doc(adminDb, 'xrayAppointments', id)); return { success: true }; }
export async function deleteUltrasoundAppointment(id: string) { await deleteDoc(doc(adminDb, 'ultrasoundAppointments', id)); return { success: true }; }
export async function deleteVaccineAppointment(id: string) { await deleteDoc(doc(adminDb, 'vaccineAppointments', id)); return { success: true }; }

export async function saveNewAppointment(a: any, p: any, isD: boolean, c?: string) { 
    const id = uuidv4(); 
    const data = { 
        ...a, id, 
        appointmentNumber: `CITA-${uuidv4().split('-')[0].toUpperCase()}`, 
        patientId: p.curp, 
        patient: p, 
        coloniaName: c, 
        createdAt: new Date().toISOString() 
    };
    await setDoc(doc(adminDb, 'appointments', id), data); 
    await setDoc(doc(adminDb, 'patients', p.curp), { ...p, id: p.curp }, { merge: true }); 
    return { success: true, data: serializeData(data) }; 
}

export async function rescheduleAppointment(id: string, date: string, type: string) {
    const coll = type === 'lab' ? 'labAppointments' : type === 'xray' ? 'xrayAppointments' : type === 'ultrasound' ? 'ultrasoundAppointments' : type === 'vaccine' ? 'vaccineAppointments' : 'appointments';
    await updateDoc(doc(adminDb, coll, id), { date });
    return { success: true, message: 'Cita reprogramada exitosamente.' };
}

export async function cloneAppointment(id: string, date: string, type: string, time?: string) {
    const coll = type === 'lab' ? 'labAppointments' : type === 'xray' ? 'xrayAppointments' : type === 'ultrasound' ? 'ultrasoundAppointments' : type === 'vaccine' ? 'vaccineAppointments' : 'appointments';
    const snap = await getDoc(doc(adminDb, coll, id));
    if (!snap.exists()) return { success: false, message: 'La cita original no existe.' };
    const data = snap.data();
    const newId = uuidv4();
    await setDoc(doc(adminDb, coll, newId), {
        ...data,
        id: newId,
        date,
        time: time || data.time,
        status: 'Agendada',
        appointmentNumber: `CLON-${uuidv4().split('-')[0].toUpperCase()}`,
        createdAt: new Date().toISOString()
    });
    return { success: true, message: 'Nueva cita asignada correctamente.' };
}

// --- FARMACIA Y ALMACÉN ---
export async function getMedications() { const s = await getDocs(query(collection(adminDb, 'medications'), limit(3000))); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
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

export async function getSupplies() { const s = await getDocs(query(collection(adminDb, 'supplies'), limit(3000))); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
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

// --- CLÍNICAS Y CATÁLOGOS ---
export async function getClinicsData() { const s = await getDocs(collection(adminDb, 'clinics')); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateClinics(c: Clinic[]) { 
    const b = writeBatch(adminDb);
    c.forEach(x => b.set(doc(adminDb, 'clinics', x.id), x));
    await b.commit();
    return { success: true };
}
export async function deleteClinic(id: string) { await deleteDoc(doc(adminDb, 'clinics', id)); return { success: true }; }

export async function getColoniasData() { const s = await getDocs(collection(adminDb, 'colonias')); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateColonias(c: Colonia[]) { const b = writeBatch(adminDb); c.forEach(x => b.set(doc(adminDb, 'colonias', x.id), x)); await b.commit(); return { success: true }; }
export async function getServiceTypesData() { const s = await getDocs(collection(adminDb, 'serviceTypes')); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateServiceTypes(t: any[]) { const b = writeBatch(adminDb); t.forEach(x => b.set(doc(adminDb, 'serviceTypes', x.id), x)); await b.commit(); return { success: true }; }
export async function getSpecialtiesData() { const s = await getDocs(collection(adminDb, 'specialties')); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateSpecialties(t: any[]) { const b = writeBatch(adminDb); t.forEach(x => b.set(doc(adminDb, 'specialties', x.id), x)); await b.commit(); return { success: true }; }
export async function getAnnouncementsData() { const s = await getDoc(doc(adminDb, 'settings', 'announcements')); return s.exists() ? s.data().messages : []; }
export async function updateAnnouncements(m: string[]) { await setDoc(doc(adminDb, 'settings', 'announcements'), { messages: m }); return { success: true }; }
export async function getHolidaysData() { const s = await getDocs(collection(adminDb, 'holidays')); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateHolidays(h: Holiday[]) { const b = writeBatch(adminDb); h.forEach(x => b.set(doc(adminDb, 'holidays', x.date), x)); await b.commit(); return { success: true }; }
export async function getSpecialActionDaysData() { const s = await getDocs(collection(adminDb, 'specialActionDays')); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateSpecialActionDays(i: SpecialActionDay[]) { const b = writeBatch(adminDb); i.forEach(x => b.set(doc(adminDb, 'specialActionDays', x.date + '_' + x.clinicType), x)); await b.commit(); return { success: true }; }

// --- SERVICIOS AUXILIARES ---
export async function getLabSettings() { const s = await getDoc(doc(adminDb, 'settings', 'labSettings')); return s.exists() ? serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 0, weekendBookingEnabled: false, startTime: '08:00', endTime: '13:00' }; }
export async function updateLabSettings(s: any) { await setDoc(doc(adminDb, 'settings', 'labSettings'), s); return { success: true }; }
export async function getLabStudies() { const s = await getDocs(collection(adminDb, 'labStudies')); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateLabStudies(s: any[]) { const b = writeBatch(adminDb); s.forEach(x => b.set(doc(adminDb, 'labStudies', x.id), x)); await b.commit(); return { success: true }; }
export async function getLabAppointmentsData() { const s = await getDocs(query(collection(adminDb, 'labAppointments'), limit(5000))); return hydrateAppointments(s.docs.map(d => d.data())); }

export async function getXRaySettings() { const s = await getDoc(doc(adminDb, 'settings', 'xraySettings')); return s.exists() ? serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 0, weekendBookingEnabled: false, startTime: '08:00', endTime: '13:00' }; }
export async function updateXRaySettings(s: any) { await setDoc(doc(adminDb, 'settings', 'xraySettings'), s); return { success: true }; }
export async function getXRayStudies() { const s = await getDocs(collection(adminDb, 'xrayStudies')); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateXRayStudies(s: any[]) { const b = writeBatch(adminDb); s.forEach(x => b.set(doc(adminDb, 'xrayStudies', x.id), x)); await b.commit(); return { success: true }; }
export async function getXRayAppointmentsData() { const s = await getDocs(query(collection(adminDb, 'xrayAppointments'), limit(5000))); return hydrateAppointments(s.docs.map(d => d.data())); }

export async function getUltrasoundSettings() { const s = await getDoc(doc(adminDb, 'settings', 'ultrasoundSettings')); return s.exists() ? serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 0, weekendBookingEnabled: false, startTime: '08:00', endTime: '13:00' }; }
export async function updateUltrasoundSettings(s: any) { await setDoc(doc(adminDb, 'settings', 'ultrasoundSettings'), s); return { success: true }; }
export async function getUltrasoundStudies() { const s = await getDocs(collection(adminDb, 'ultrasoundStudies')); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateUltrasoundStudies(s: any[]) { const b = writeBatch(adminDb); s.forEach(x => b.set(doc(adminDb, 'ultrasoundStudies', x.id), x)); await b.commit(); return { success: true }; }
export async function getUltrasoundAppointmentsData() { const s = await getDocs(query(collection(adminDb, 'ultrasoundAppointments'), limit(5000))); return hydrateAppointments(s.docs.map(d => d.data())); }

export async function getVaccineSettings() { const s = await getDoc(doc(adminDb, 'settings', 'vaccineSettings')); return s.exists() ? serializeData(s.data()) : { dailySlots: 10, waitlistSlots: 0, weekendBookingEnabled: false, startTime: '08:00', endTime: '13:00' }; }
export async function updateVaccineSettings(s: any) { await setDoc(doc(adminDb, 'settings', 'vaccineSettings'), s); return { success: true }; }
export async function getVaccines() { const s = await getDocs(collection(adminDb, 'vaccines')); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function updateVaccines(s: any[]) { const b = writeBatch(adminDb); s.forEach(x => b.set(doc(adminDb, 'vaccines', x.id), x)); await b.commit(); return { success: true }; }
export async function getVaccineAppointmentsData() { const s = await getDocs(query(collection(adminDb, 'vaccineAppointments'), limit(5000))); return hydrateAppointments(s.docs.map(d => d.data())); }

// --- CONSULTAS Y RECETAS ---
export async function getConsultationsByPatientId(pid: string) { const s = await getDocs(query(collection(adminDb, 'medicalConsultations'), where('patientId', '==', pid))); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function getPrescriptionsByPatientId(pid: string) { const s = await getDocs(query(collection(adminDb, 'prescriptions'), where('patientId', '==', pid))); return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id })); }
export async function createPrescription(p: any) { const id = uuidv4(); const folio = `REC-${uuidv4().split('-')[0].toUpperCase()}`; await setDoc(doc(adminDb, 'prescriptions', id), { ...p, id, folio, status: 'pendiente', createdAt: new Date().toISOString() }); return { success: true, folio, prescription: { ...p, id, folio } }; }
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
    let q = query(collection(adminDb, 'prescriptions'), where('status', '==', 'pendiente'), limit(200));
    const snap = await getDocs(q);
    let results = snap.docs.map(d => ({ ...serializeData(d.data()), id: d.id }));
    if (filters?.folio) results = results.filter(r => r.folio.includes(filters.folio.toUpperCase()));
    return results;
}
export async function getPrescriptionHistory(f: any) {
    const q = query(collection(adminDb, 'prescriptions'), where('status', '==', 'surtida'), limit(1000));
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
export async function getConsultationByAppointmentId(aid: string) { const q = query(collection(adminDb, 'medicalConsultations'), where('appointmentId', '==', aid)); const s = await getDocs(q); return s.empty ? null : serializeData({ ...s.docs[0].data(), id: s.docs[0].id }); }

// --- MANTENIMIENTO ---
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
    const snap = await getDocs(query(collection(adminDb, 'patients'), limit(5000)));
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

export async function searchCie10(t: string) {
    const s = await getDocs(query(collection(adminDb, 'cie10Catalog'), where('nombre', '>=', t.toUpperCase()), limit(50)));
    return s.docs.map(d => ({ ...serializeData(d.data()), id: d.id }));
}

export async function bulkInsertCie10Glossary(data: any[]) {
    const b = writeBatch(adminDb);
    data.forEach(d => b.set(doc(adminDb, 'cie10Glossary', uuidv4()), d));
    await b.commit();
    return { success: true, processedCount: data.length };
}

export async function bulkInsertCie10Catalog(data: any[]) {
    const b = writeBatch(adminDb);
    data.forEach(d => b.set(doc(adminDb, 'cie10Catalog', d.catalogKey || uuidv4()), d));
    await b.commit();
    return { success: true, processedCount: data.length };
}

export async function deleteAllCie10Glossary() { const s = await getDocs(collection(adminDb, 'cie10Glossary')); const b = writeBatch(adminDb); s.docs.forEach(d => b.delete(d.ref)); await b.commit(); return { success: true }; }
export async function deleteAllCie10Catalog() { const s = await getDocs(collection(adminDb, 'cie10Catalog')); const b = writeBatch(adminDb); s.docs.forEach(d => b.delete(d.ref)); await b.commit(); return { success: true }; }

export async function bulkInsertDoctors(doctors: any[]) {
    const batch = writeBatch(adminDb);
    doctors.forEach(d => {
        const id = d.id || uuidv4();
        batch.set(doc(adminDb, 'clinics', id), {
            ...d, id,
            doctorName: String(d.doctorName || d['Médico'] || '').toUpperCase().trim(),
            name: String(d.name || d['Unidad'] || '').toUpperCase().trim(),
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

export async function getAttendedPatientsForClinic(cid: string) {
    const q = query(collection(adminDb, 'appointments'), where('clinicId', '==', cid), where('status', '==', 'Atendido'), limit(2000));
    const snap = await getDocs(q);
    const patientIds = Array.from(new Set(snap.docs.map(d => d.data().patientId)));
    if (patientIds.length === 0) return [];
    
    const patients: Patient[] = [];
    for (let i = 0; i < patientIds.length; i += 30) {
        const chunk = patientIds.slice(i, i + 30);
        const pq = query(collection(adminDb, 'patients'), where('__name__', 'in', chunk));
        const psnap = await getDocs(pq);
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

export async function getBIData() {
    const [apps, lab, xr, us, vac, clinics, colonias] = await Promise.all([
        getDocs(query(collection(adminDb, 'appointments'), limit(5000))),
        getDocs(query(collection(adminDb, 'labAppointments'), limit(1000))),
        getDocs(query(collection(adminDb, 'xrayAppointments'), limit(1000))),
        getDocs(query(collection(adminDb, 'ultrasoundAppointments'), limit(1000))),
        getDocs(query(collection(adminDb, 'vaccineAppointments'), limit(1000))),
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
