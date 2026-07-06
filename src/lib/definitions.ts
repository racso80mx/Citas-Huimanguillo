
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

export enum ClinicType {
    ConsultaExterna = 'Consulta Externa',
    Especializada = 'Consulta Externa Especializada',
    Psicologia = 'Psicología',
    Nutricion = 'Nutrición',
    Odontologia = 'Odontología',
    Externo = 'Médico Externo / Otra Área'
}

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

export enum BookingMode {
    Time = 'time',
    Token = 'token'
}

export type CustomSchedule = {
    date: string; // YYYY-MM-DD
    endTime: string; // HH:mm
    reason?: string;
};

export type ClinicBlock = {
    id: string; // clinicId_date
    clinicId: string;
    date: string; // YYYY-MM-DD
    type: 'vacation' | 'custom';
    endTime?: string;
    reason?: string;
};

export const ClinicSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "El nombre de la unidad es requerido."),
  doctorName: z.string().min(1, "El nombre del doctor es requerido."),
  doctorCurp: z.string().optional(),
  professionalLicense: z.string().optional(),
  password: z.string().min(1, "La contraseña es requerida."),
  dailySlots: z.number().min(1, "Debe haber al menos 1 cita."),
  waitlistSlots: z.number().default(0),
  startTime: z.string(),
  endTime: z.string(),
  breakTime: z.string().optional(),
  weekendBookingEnabled: z.boolean(),
  daysOfAction: z.array(z.string()).optional(),
  unavailableDates: z.array(z.string()).optional(),
  customSchedules: z.array(z.object({
      date: z.string(),
      endTime: z.string(),
      reason: z.string().optional()
  })).optional(),
  serviceTypeId: z.string().min(1, "El tipo de consulta es requerido."),
  specialtyId: z.string().optional(),
  bookingMode: z.nativeEnum(BookingMode),
  consultationDuration: z.number().min(1).optional(),
});

export type Clinic = z.infer<typeof ClinicSchema>;

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

export type Report = {
    id: string;
    clinicId: string;
    date: string; // YYYY-MM-DD
    totalAppointments: number;
    attended: number;
    pending: number;
    cancelled: number;
}

export const LabStudySchema = z.object({
    id: z.string(),
    code: z.string().optional(),
    section: z.string().min(1, 'La sección es requerida.'),
    name: z.string().min(1, 'El nombre es requerido.'),
    sampleType: z.string().min(1, 'El tipo de muestra es requerido.'),
    fastingHours: z.string(),
    available: z.boolean(),
});
export type LabStudy = z.infer<typeof LabStudySchema>;

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

export const XRayStudySchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'El nombre del estudio es requerido.'),
  indications: z.string().min(1, 'Las indicaciones son requeridas.'),
  available: z.boolean(),
});
export type XRayStudy = z.infer<typeof XRayStudySchema>;

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

export const UltrasoundStudySchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'El nombre del estudio es requerido.'),
  indications: z.string().min(1, 'Las indicaciones son requeridas.'),
  available: z.boolean(),
});
export type UltrasoundStudy = z.infer<typeof UltrasoundStudySchema>;

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

export const VaccineSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "El nombre es requerido"),
  applicationAge: z.string(),
  sex: z.string(),
  description: z.string().min(1, "La descripción es requerida."),
  available: z.boolean(),
});
export type Vaccine = z.infer<typeof VaccineSchema>;

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

export type ArchiveSettings = {
    password?: string;
}

export type PharmacySettings = {
    password?: string;
}

export type WarehouseSettings = {
    password?: string;
}

export type BISettings = {
    password?: string;
}

export type AdminSettings = {
    password?: string;
}

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
    clinicId: string; // 'externo' for external doctors
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
    
    // Signos Vitales
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
    
    // Clínica
    tbSymptomatic?: string;
    firstTimeOfYear?: boolean;
    motiveRelation: string;
    
    // Diagnósticos
    diagnosis1: string;
    diagnosis1Type: string;
    diagnosis2?: string;
    diagnosis2Type?: string;
    diagnosis3?: string;
    diagnosis3Type?: string;
    
    // Salud Mental
    mentalHealthAction?: string;
    recipeFolio?: string;
    
    // Atención Pregestacional
    pregestationalCare?: 'Primera vez' | 'Subsecuente';
    pregestationalRisk?: string;
    
    // Control Prenatal
    pregnancyTrimester?: string;
    pregnancyHighRisk?: boolean;
    pregnancyComplications?: string[];
    pregnancyActions?: string[];

    // Atención Obstétrica (Atención del evento)
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
    
    // Puerperio
    puerperiumType?: 'Puérpera 1ra' | 'Puérpera Sub';
    puerperiumInfection?: boolean;
    puerperiumInfectionDetails?: string;
    puerperiumPlanning?: boolean;
    
    // Otros eventos
    otherEvents?: string[];
    
    // Promoción
    vsoPackets?: number;
    lifeLine?: boolean;
    healthCard?: boolean;
    vaccinationComplete?: boolean;
    
    // Referencia
    referredBy?: string;
    counterReferred?: boolean;
    
    // Telemedicina
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
    prin_sinac: string;
    prin_sinac_grupo: string;
    descripcion_sinac_grupo: string;
    prin_sinac_subgrupo: string;
    descripcion_sinac_subgrupo: string;
    daga: string;
    asterisco: string;
    prin_mm: string;
    prin_mm_grupo: string;
    descripcion_mm_grupo: string;
    prin_mm_subgrupo: string;
    descripcion_mm_subgrupo: string;
    cod_adi_mort: string;
};
