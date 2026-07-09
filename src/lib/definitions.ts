
import { z } from 'zod';

export type ActivityLog = {
  id: string;
  timestamp: string; // ISO string
  action: string;
  details: string;
};

export type User = {
  id: string; // Firebase UID or generated UUID
  email: string;
  name: string;
  role: 'admin' | 'doctor';
  clinicId?: string; // Only for doctors
  password?: string; // Only for creation/update
};

export enum PatientStatus {
  Vigente = 'Vigente',
  Baja = 'Baja', // Represents Baja Temporal
  BajaDefinitiva = 'Baja Definitiva',
}

export type Patient = {
  id: string; // UUID
  expediente?: string;
  curp: string;
  name: string;
  paternalLastName: string;
  maternalLastName: string;
  nombreCompleto?: string; // Search-optimized field
  birthDate?: string;
  sex: 'Hombre' | 'Mujer';
  age: number;
  birthState: string;
  address?: string;
  coloniaName?: string;
  fatherName?: string;
  motherName?: string;
  fatherAge?: number;
  motherAge?: number;
  registrationDate?: string;
  status?: PatientStatus;
  derechoAbiencia?: string;
  phoneNumber: string;
  lastAppointmentDate?: string;
};

export enum PatientType {
    General = 'General',
    Cronico = 'Crónico',
    Embarazada = 'Embarazada',
    TerceraEdad = '3ra Edad',
    RecienNacido = 'Recién Nacido'
}

export type AppointmentStatus = 'Agendada' | 'Atendido' | 'No Atendido' | 'No Asistió';

export type Appointment = {
  id: string; // UUID
  appointmentNumber: string;
  patientId: string;
  clinicId: string;
  coloniaName?: string;
  date: string; // ISO string for serializability
  time: string; // HH:mm format or "Por Ficha" or "Espera X"
  duration?: number; // Duration in minutes at the time of booking
  patientType: PatientType;
  status: AppointmentStatus;
  patient: Patient;
  isNewborn?: boolean;
  createdAt?: string; // ISO date of creation
};

export enum BookingMode {
    Time = 'time',
    Token = 'token'
}

export type Clinic = {
  id: string;
  name: string;
  doctorName: string;
  doctorCurp?: string;
  professionalLicense?: string;
  password: string;
  dailySlots: number;
  waitlistSlots: number;
  startTime: string;
  endTime: string;
  breakTime?: string;
  weekendBookingEnabled: boolean;
  daysOfAction?: string[];
  unavailableDates?: string[];
  customSchedules?: {
      date: string;
      endTime: string;
      reason?: string;
  }[];
  serviceTypeId: string;
  specialtyId?: string;
  bookingMode: BookingMode;
  consultationDuration?: number;
  clinicType?: string;
};

export type ServiceType = {
    id: string;
    name: string;
    available: boolean;
};

export type Specialty = {
    id: string;
    name: string;
    description?: string;
    available: boolean;
};

export type Department = {
    id: string;
    name: string;
    available: boolean;
};

export type Colonia = {
  id: string; // UUID
  name: string;
  clinicId: string;
};

export type DailyAvailability = {
  date: string; // YYYY-MM-DD
  availableSlots: number;
  availabilityByClinic: { [key: string]: number };
  takenTimesByClinic: { [key: string]: any[] }; 
};

export type LabStudy = {
    id: string;
    code?: string;
    section: string;
    name: string;
    sampleType: string;
    fastingHours: string;
    available: boolean;
};

export type LabAppointment = {
    id: string;
    appointmentNumber: string;
    patientId: string;
    date: string; // ISO string
    time: string; // HH:mm or "Espera X"
    studies: LabStudy[];
    status: AppointmentStatus;
    patient: Patient;
    patientType: PatientType;
    createdAt?: string;
}

export type LabSettings = {
    dailySlots: number;
    waitlistSlots: number;
    weekendBookingEnabled: boolean;
    password?: string;
    startTime?: string;
    endTime?: string;
    breakTime?: string;
}

export type XRayStudy = {
  id: string;
  name: string;
  indications: string;
  available: boolean;
};

export type XRayAppointment = {
    id: string;
    appointmentNumber: string;
    patientId: string;
    date: string; // ISO string
    time: string; // HH:mm or "Espera X"
    studyId: string;
    studyName: string;
    status: AppointmentStatus;
    patient: Patient;
    patientType: PatientType;
    createdAt?: string;
}

export type XRaySettings = {
    dailySlots: number;
    waitlistSlots: number;
    startTime: string;
    endTime: string;
    weekendBookingEnabled: boolean;
    password?: string;
    breakTime?: string;
}

export type UltrasoundStudy = {
  id: string;
  name: string;
  indications: string;
  available: boolean;
};

export type UltrasoundAppointment = {
    id: string;
    appointmentNumber: string;
    patientId: string;
    date: string; // ISO string
    time: string; // HH:mm or "Espera X"
    studyId: string;
    studyName: string;
    status: AppointmentStatus;
    patient: Patient;
    patientType: PatientType;
    createdAt?: string;
}

export type UltrasoundSettings = {
    dailySlots: number;
    waitlistSlots: number;
    startTime: string;
    endTime: string;
    weekendBookingEnabled: boolean;
    password?: string;
    breakTime?: string;
}

export type Vaccine = {
  id: string;
  name: string;
  applicationAge: string;
  sex: string;
  description: string;
  available: boolean;
};

export type VaccineAppointment = {
  id: string;
  appointmentNumber: string;
  patientId: string; 
  date: string;
  time: string;
  clinicId?: string; 
  coloniaName?: string;
  vaccines: Vaccine[];
  status: AppointmentStatus;
  patient: Patient; 
  patientType: PatientType;
  createdAt?: string;
};

export type VaccineSettings = {
  dailySlots: number;
  waitlistSlots: number;
  startTime: string;
  endTime: string;
  weekendBookingEnabled: boolean;
  password?: string;
  breakTime?: string;
};

export type ModuleSettings = {
  citasMedicasEnabled: boolean;
  laboratorioEnabled: boolean;
  rayosXEnabled: boolean;
  ultrasoundEnabled: boolean;
  vacunasEnabled: boolean;
  archivoEnabled: boolean;
  farmaciaEnabled: boolean;
  almacenEnabled: boolean;
  archivoConsultaEnabled: boolean;
  citasMedicasWhatsAppEnabled: boolean;
  laboratorioWhatsAppEnabled: boolean;
  rayosXWhatsAppEnabled: boolean;
  ultrasoundWhatsAppEnabled: boolean;
  vacunasWhatsAppEnabled: boolean;
  archivoWhatsAppEnabled: boolean;
  citasMedicasPassword?: string;
  archivoConsultaPassword?: string;
};

export type ArchiveSettings = { password?: string; }
export type PharmacySettings = { password?: string; }
export type WarehouseSettings = { password?: string; }
export type BISettings = { password?: string; }
export type AdminSettings = { password?: string; }

export type ArchiveCounts = {
  total: number;
  vigente: number;
  bajaTemporal: number;
  bajaDefinitiva: number;
};

export type Medication = {
  id: string;
  claveCuadroBasico: string;
  descripcion: string;
  grupo: string;
  existencia: number;
  precioUnitario: number;
  totalImporte: number;
  lote: string;
  proveedor: string;
  rfcProveedor: string;
  almacen: string;
  fuenteFinanciamiento: string;
  fechaCaducidad: string;
  ordenSuministro: string;
  tipoInsumo: string;
  numeroContrato: string;
  updatedAt?: string;
};

export type Supply = Medication; 

export type Holiday = {
  date: string; // YYYY-MM-DD
  name: string;
};

export type SpecialActionDay = {
  date: string; // YYYY-MM-DD
  clinicType: string; 
  name: string;
};

export type PrescriptionStatus = 'pendiente' | 'surtida' | 'vencida';

export type PrescriptionItem = {
    medicationId: string;
    name: string;
    clave: string;
    quantity: number;
    indications?: string;
    lote?: string;
    frequency?: string;
};

export type Prescription = {
    id: string;
    folio: string;
    patientId: string;
    patientName: string;
    clinicId: string; 
    doctorName: string;
    doctorLicense?: string;
    unitName?: string;
    date: string; // ISO
    expiresAt: string; // ISO
    diagnosis?: string;
    items: PrescriptionItem[];
    otherMedications?: string;
    labStudies?: string[];
    otherStudies?: string;
    status: PrescriptionStatus;
    type: 'interno' | 'externo';
};

export type MedicalConsultation = {
    id: string;
    appointmentId: string;
    patientId: string;
    clinicId: string;
    doctorName: string;
    date: string;
    service: string;
    weight?: number;
    height?: number;
    imc?: number;
    waist?: number;
    systolicBP?: number;
    diastolicBP?: number;
    heartRate?: number;
    respiratoryRate?: number;
    temperature?: number;
    oxygenSaturation?: number;
    glucose?: number;
    fastingGlucose?: boolean;
    tbSymptomatic?: string;
    firstTimeOfYear?: boolean;
    motiveRelation: string;
    diagnosis1: string;
    diagnosis1Type: string;
    diagnosis2?: string;
    diagnosis2Type?: string;
    diagnosis3?: string;
    diagnosis3Type?: string;
    mentalHealthAction?: string;
    recipeFolio?: string;
    pregestationalCare?: 'Primera vez' | 'Subsecuente';
    pregestationalRisk?: string;
    pregnancyTrimester?: string;
    pregnancyHighRisk?: boolean;
    pregnancyComplications?: string[];
    pregnancyActions?: string[];
    obstetricAttentionDate?: string;
    obstetricAttentionTime?: string;
    gestationalWeeks?: number;
    obstetricAttentionType?: string;
    abortionType?: string;
    freePositionChosen?: string;
    verticalExpulsivePeriod?: string;
    psychologicalAccompaniment?: string;
    activeThirdPeriodManagement?: string;
    nonPharmacologicalMeasures?: string;
    delayedCordClamping?: string;
    birthType?: string;
    withProduct?: string;
    familyPlanningMethods?: string[];
    puerperiumType?: 'Puérpera 1ra' | 'Puérpera Sub';
    puerperiumInfection?: boolean;
    puerperiumPlanning?: boolean;
    otherEvents?: string[];
    vsoPackets?: number;
    lifeLine?: boolean;
    healthCard?: boolean;
    vaccinationComplete?: boolean;
    referredBy?: string;
    counterReferred?: boolean;
    telemedicineRole?: string;
    telemedicineStudies?: boolean;
    nextAppointmentDate?: string;
    createdAt: string;
};

export type Cie10Record = {
    id: string;
    consecutivo: string;
    letra: string;
    catalogKey: string;
    nombre: string;
    codigox: string;
    lsex: string;
    linf: string;
    lsup: string;
    trivial: string;
    erradicado: string;
    n_inter: string;
    nin: string;
    ninmtobs: string;
    codSitLesion: string;
    noCbd: string;
    cbd: string;
    noAph: string;
    afPrin: string;
    diaSis: string;
    claveProgramaSis: string;
    codComplemenMorbi: string;
    diaFetal: string;
    defFetalCm: string;
    defFetalCbd: string;
    claveCapitulo: string;
    capitulo: string;
    lista1: string;
    grupo1: string;
    lista5: string;
    rubricaType: string;
    yearModifi: string;
    yearAplicacion: string;
    valid: string;
    prinmorta: string;
    prinmorbi: string;
    lmMorbi: string;
    lmMorta: string;
    lgbd165: string;
    lomsbeck: string;
    lgbd190: string;
    notdiaria: string;
    notsemanal: string;
    sistemaEspecial: string;
    birmm: string;
    cveCausaType: string;
    causaType: string;
    epiMorta: string;
    edasEIrasEnM5: string;
    cveMaternasSeedEpid: string;
    epiMortaM5: string;
    epiMorbi: string;
    defMaternas: string;
    esCauses: string;
    numCauses: string;
    esSuiveMorta: string;
    esSuiveMorbi: string;
    epiClave: string;
    epiClaveDesc: string;
    esSuiveNotin: string;
    esSuiveEstEpi: string;
    esSuiveEstBrote: string;
    sinac: string;
    prinSinac: string;
    prinSinacGrupo: string;
    descripcionSinacGrupo: string;
    prinSinacSubgrupo: string;
    descripcionSinacSubgrupo: string;
    daga: string;
    asterisco: string;
    prinMm: string;
    prinMmGrupo: string;
    descripcionMmGrupo: string;
    prinMmSubgrupo: string;
    descripcionMmSubgrupo: string;
    codAdiMort: string;
};

export type VoucherItem = {
    medicationId: string;
    medicationName: string;
    lote: string;
    quantity: number;
    source: 'IMSS-BIENESTAR' | 'EXTERNO';
};

export type PharmacyVoucher = {
    id: string;
    folio: string;
    date: string;
    department: string;
    items: VoucherItem[];
    responsible: string;
    createdAt: string;
};
