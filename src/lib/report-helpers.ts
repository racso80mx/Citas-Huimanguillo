
'use client';
import type { Appointment, Clinic, LabAppointment, XRayAppointment, XRayStudy, UltrasoundAppointment, UltrasoundStudy, VaccineAppointment, Vaccine, Prescription, Patient } from "./definitions";
import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { logoBase64 } from './logo-data';

const PRIMARY_COLOR = [0, 102, 51]; // Verde Institucional

// Helper para el encabezado común
function addPDFHeader(doc: any, title: string) {
    // Fondo del encabezado
    doc.setFillColor(245, 245, 245);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setDrawColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
    doc.setLineWidth(1.5);
    doc.line(0, 40, 210, 40);

    // Logotipo
    try {
        doc.addImage(logoBase64, 'PNG', 15, 8, 22, 22);
    } catch (e) {}

    // Información del Hospital
    doc.setTextColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('HOSPITAL GENERAL DE HUIMANGUILLO', 42, 18);
    
    doc.setTextColor(100);
    doc.setFontSize(9);
    doc.setFont('Helvetica', 'normal');
    doc.text('SECRETARÍA DE SALUD DEL ESTADO DE TABASCO', 42, 24);
    doc.text('SISTEMA DE CITAS MÉDICAS DIGITALES', 42, 29);

    // Título del Documento
    doc.setTextColor(0);
    doc.setFontSize(16);
    doc.setFont('Helvetica', 'bold');
    doc.text(title, 105, 55, { align: 'center' });
}

// Helper para resaltar fecha y hora
function addDateTimeHighlight(doc: any, date: string, time: string, currentY: number) {
    doc.setFillColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
    doc.rect(20, currentY, 170, 10, 'F');
    doc.setTextColor(255);
    doc.setFontSize(10);
    doc.text('DETALLES DE LA CITA', 105, currentY + 6.5, { align: 'center' });

    currentY += 10;
    doc.setFillColor(245, 250, 245);
    doc.rect(20, currentY, 170, 25, 'F');
    doc.setDrawColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
    doc.setLineWidth(0.5);
    doc.rect(20, currentY, 170, 25, 'D');

    doc.setTextColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
    doc.setFontSize(17);
    const dateObj = date ? (typeof date === 'string' ? parseISO(date) : new Date(date)) : null;
    const formattedDate = dateObj && isValid(dateObj) ? format(dateObj, "eeee, dd 'de' MMMM 'de' yyyy", { locale: es }).toUpperCase() : 'FECHA NO DISPONIBLE';
    doc.text(formattedDate, 105, currentY + 10, { align: 'center' });
    
    doc.setFontSize(22);
    doc.text(String(time || 'S/H').includes('Ficha') ? String(time).toUpperCase() : `HORA: ${time || '---'} HRS`, 105, currentY + 20, { align: 'center' });
    return currentY + 35;
}

// Helper para el pie de página
function addPDFFooter(doc: any) {
    const footerY = 285;
    doc.setDrawColor(220);
    doc.setLineWidth(0.5);
    doc.line(20, footerY - 10, 190, footerY - 10);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text('Este documento es un comprobante oficial de reservación. Presente INE y Cartilla Nacional de Salud.', 105, footerY - 5, { align: 'center' });
    doc.text(`Hospital General Huimanguillo - Generado el ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 105, footerY, { align: 'center' });
}

export async function downloadExcel(data: any[], filename: string) {
    const xlsx = await import('xlsx');
    const isLab = filename.includes('laboratorio');
    const isXRay = filename.includes('rayos_x');
    const isUltrasound = filename.includes('ultrasonidos');
    const isVaccine = filename.includes('vacunas');
    
    const worksheetData = data.map(
        (item) => {
            // SAFELY PARSE DATES (Senior implementation)
            let fechaCita = 'N/A';
            if (item.date) {
                try {
                    const parsed = typeof item.date === 'string' ? parseISO(item.date) : new Date(item.date);
                    if (isValid(parsed)) {
                        fechaCita = format(parsed, 'dd/MM/yyyy');
                    }
                } catch (e) {}
            }

            let fechaRegistro = 'N/A';
            if (item.createdAt) {
                try {
                    const parsedReg = typeof item.createdAt === 'string' ? parseISO(item.createdAt) : new Date(item.createdAt);
                    if (isValid(parsedReg)) {
                        fechaRegistro = format(parsedReg, 'dd/MM/yyyy HH:mm', { locale: es });
                    }
                } catch (e) {}
            }

            const baseData: any = {
                'Folio': item.appointmentNumber || 'N/A',
                'Expediente': String(item.expediente || item.patient?.expediente || 'N/A'),
                'Fecha Cita': fechaCita,
                'Hora': item.time || 'N/A',
                'Fecha Registro': fechaRegistro,
                'Estado': item.status || 'N/A',
                'Paciente': item.patient ? `${item.patient.name} ${item.patient.paternalLastName} ${item.patient.maternalLastName}`: (item.name ? `${item.name} ${item.paternalLastName} ${item.maternalLastName}` : 'N/A'),
                'CURP': item.patient?.curp || item.curp || 'N/A',
                'Teléfono': item.patient?.phoneNumber || item.phoneNumber || 'N/A',
                'Municipio': item.coloniaName || item.patient?.coloniaName || 'N/A',
                'Estatus Padrón': item.status || 'N/A'
            };

            if (isLab) {
                baseData['Estudios'] = (item.studies || []).map((s: any) => `${s.code ? `${s.code} - ` : ''}${s.name}`).join(', ');
            } else if (isXRay || isUltrasound) {
                 baseData['Estudio'] = item.studyName;
            } else if (isVaccine) {
                baseData['Vacunas'] = (item.vaccines || []).map((v: any) => v.name).join(', ');
                baseData['Recién Nacido'] = item.patientType === 'Recién Nacido' ? 'Sí' : 'No';
            } else {
                if (item.time && String(item.time).includes('Ficha')) {
                    baseData['Ficha'] = item.time.split(' ')[1];
                }
                baseData['Núcleo'] = item.clinicName;
                baseData['Tipo Paciente'] = item.patientType;
            }
            return baseData;
        }
    );

  const worksheet = xlsx.utils.json_to_sheet(worksheetData);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Registros');

  if (worksheetData.length > 0) {
    const cols = Object.keys(worksheetData[0]);
    const colWidths = cols.map(col => ({
        wch: Math.max(...worksheetData.map(row => (row[col as keyof typeof row] ?? '').toString().length), col.length) + 1
    }));
    worksheet['!cols'] = colWidths;
  }

  xlsx.writeFile(workbook, `${filename}.xlsx`);
}

export async function generateArchiveListPDF(appointments: any[], title: string, subtitle: string) {
    const { jsPDF } = await import('jspdf');
    await import('jspdf-autotable');
    const doc = new jsPDF('landscape') as any;

    try {
        doc.addImage(logoBase64, 'PNG', 14, 10, 15, 15);
    } catch (e) {}

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(title, 35, 18);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(subtitle, 35, 24);

    const tableBody = appointments.map(app => [
        app.time,
        app.appointmentNumber,
        app.patient ? `${app.patient.paternalLastName} ${app.patient.maternalLastName} ${app.patient.name}` : 'PACIENTE NO DEFINIDO',
        String(app.patient?.expediente || 'S/E'),
        app.patient?.curp || 'S/C',
        app.patientType,
        app.clinicName || 'N/A',
        '' 
    ]);

    doc.autoTable({
        startY: 32,
        head: [['Hora', 'Folio', 'Nombre del Paciente', 'Expediente', 'CURP', 'Tipo', 'Consultorio/Núcleo', 'Observaciones']],
        body: tableBody,
        theme: 'grid',
        headStyles: { fillColor: PRIMARY_COLOR, fontSize: 10 },
        styles: { fontSize: 9 },
        columnStyles: {
            0: { cellWidth: 20 },
            1: { cellWidth: 25 },
            2: { cellWidth: 'auto' },
            3: { cellWidth: 25 },
            4: { cellWidth: 40 },
            5: { cellWidth: 25 },
            6: { cellWidth: 40 },
            7: { cellWidth: 45 }
        }
    });

    const finalY = doc.lastAutoTable.finalY + 25;
    
    if (finalY < 180) {
        doc.line(100, finalY, 190, finalY);
        doc.setFontSize(10);
        doc.setTextColor(0);
        doc.text('Nombre y Firma de Recibido', 145, finalY + 5, { align: 'center' });
    } else {
        doc.addPage();
        const newY = 40;
        doc.line(100, newY, 190, newY);
        doc.setFontSize(10);
        doc.setTextColor(0);
        doc.text('Nombre y Firma de Recibido', 145, newY + 5, { align: 'center' });
    }

    const dateStr = format(new Date(), 'dd-MM-yyyy');
    doc.save(`listado_archivo_${dateStr}.pdf`);
}

export async function generateAppointmentPDF(appointmentData: Appointment, clinicData: Clinic, announcements: string[]) {
    const { jsPDF } = await import('jspdf');
    await import('jspdf-autotable');
    const doc = new jsPDF() as any;
    const { patient, date, time, appointmentNumber, patientType } = appointmentData;

    addPDFHeader(doc, 'Confirmación de Cita Médica');
    let currentY = addDateTimeHighlight(doc, date, time, 65);

    // Columnas
    doc.setTextColor(0);
    doc.setFontSize(12);
    doc.setFont('Helvetica', 'bold');
    doc.text('DATOS DEL PACIENTE', 20, currentY);
    doc.text('UNIDAD Y MÉDICO', 110, currentY);
    
    currentY += 2;
    doc.setLineWidth(0.1);
    doc.line(20, currentY, 95, currentY);
    doc.line(110, currentY, 190, currentY);
    currentY += 8;

    doc.setFontSize(10);
    doc.setFont('Helvetica', 'normal');
    
    let leftY = currentY;
    let rightY = currentY;
    
    // Info Paciente
    const pName = patient ? `${patient.name} ${patient.paternalLastName} ${patient.maternalLastName}` : 'N/A';
    doc.setTextColor(100); doc.text('Nombre:', 20, leftY);
    doc.setTextColor(0); 
    const pNameLines = doc.splitTextToSize(pName.toUpperCase(), 50);
    doc.text(pNameLines, 45, leftY);
    leftY += (pNameLines.length * 5) + 1;
    
    doc.setTextColor(100); doc.text('CURP:', 20, leftY);
    doc.setTextColor(0); doc.text(patient?.curp || 'N/A', 45, leftY);
    leftY += 6;
    
    doc.setTextColor(100); doc.text('Tipo:', 20, leftY);
    doc.setTextColor(0); doc.text(patientType.toUpperCase(), 45, leftY);
    leftY += 6;
    
    // Info Clínica
    doc.setTextColor(100); doc.text('Unidad:', 110, rightY);
    doc.setTextColor(0); 
    const unitLines = doc.splitTextToSize(clinicData.name.toUpperCase(), 55);
    doc.text(unitLines, 135, rightY);
    rightY += (unitLines.length * 5) + 1;

    doc.setTextColor(100); doc.text('Médico:', 110, rightY);
    doc.setTextColor(0); 
    const doctorLines = doc.splitTextToSize(`DR(A). ${clinicData.doctorName.toUpperCase()}`, 55);
    doc.text(doctorLines, 135, rightY);
    rightY += (doctorLines.length * 5) + 1;

    doc.setTextColor(100); doc.text('Folio:', 110, rightY);
    doc.setTextColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
    doc.setFont('Helvetica', 'bold');
    doc.text(appointmentNumber, 135, rightY);
    rightY += 6;

    currentY = Math.max(leftY, rightY) + 12;

    // Avisos
    if (announcements && announcements.length > 0) {
        doc.setFont('Helvetica', 'bold');
        doc.setTextColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
        doc.text('INSTRUCCIONES IMPORTANTES:', 20, currentY);
        currentY += 4;
        
        doc.autoTable({
            startY: currentY,
            margin: { left: 20, right: 20 },
            body: announcements.map(a => [a.toUpperCase()]),
            theme: 'plain',
            styles: { fontSize: 8, cellPadding: 1, halign: 'left', textColor: [50, 50, 50] },
        });
    }

    addPDFFooter(doc);
    doc.save(`cita_${appointmentNumber}.pdf`);
}

export async function generateLabAppointmentPDF(appointment: LabAppointment, announcements: string[]) {
    const { jsPDF } = await import('jspdf');
    await import('jspdf-autotable');
    const doc = new jsPDF() as any;
    const { patient, date, time, appointmentNumber, studies } = appointment;

    addPDFHeader(doc, 'Cita de Laboratorio Clínico');
    let currentY = addDateTimeHighlight(doc, date, time, 65);

    doc.setTextColor(0);
    doc.setFontSize(12);
    doc.setFont('Helvetica', 'bold');
    doc.text('PACIENTE:', 20, currentY);
    doc.setFont('Helvetica', 'normal');
    const pNameLines = doc.splitTextToSize(`${patient.name} ${patient.paternalLastName} ${patient.maternalLastName}`.toUpperCase(), 140);
    doc.text(pNameLines, 50, currentY);
    currentY += (pNameLines.length * 5) + 2;

    doc.setFont('Helvetica', 'bold');
    doc.text('CURP:', 20, currentY);
    doc.setFont('Helvetica', 'normal');
    doc.text(patient.curp, 50, currentY);

    currentY += 15;
    doc.setFont('Helvetica', 'bold');
    doc.text('ESTUDIOS SOLICITADOS:', 20, currentY);
    
    const tableBody = studies.map(s => [s.name.toUpperCase(), s.sampleType, s.fastingHours]);
    doc.autoTable({
        startY: currentY + 5,
        head: [['Estudio', 'Tipo de Muestra', 'Ayuno']],
        body: tableBody,
        theme: 'grid',
        headStyles: { fillColor: PRIMARY_COLOR },
    });

    let finalY = doc.autoTable.previous.finalY + 15;
    doc.setFontSize(10);
    doc.setFont('Helvetica', 'bold');
    doc.text('RECUERDE:', 20, finalY);
    doc.setFont('Helvetica', 'normal');
    doc.text('Presentarse a las 06:30 hrs para su toma de muestras puntual a las 07:00 hrs.', 20, finalY + 5);

    addPDFFooter(doc);
    doc.save(`cita_lab_${appointmentNumber}.pdf`);
}

export async function generateXRayAppointmentPDF(appointment: XRayAppointment, study: XRayStudy, announcements: string[]) {
    const { jsPDF } = await import('jspdf');
    await import('jspdf-autotable');
    const doc = new jsPDF() as any;
    const { patient, date, time, appointmentNumber } = appointment;

    addPDFHeader(doc, 'Cita de Rayos X');
    let currentY = addDateTimeHighlight(doc, date, time, 65);

    doc.setFontSize(12);
    doc.setFont('Helvetica', 'bold');
    doc.text('PACIENTE:', 20, currentY);
    doc.setFont('Helvetica', 'normal');
    const pNameLines = doc.splitTextToSize(`${patient.name} ${patient.paternalLastName} ${patient.maternalLastName}`.toUpperCase(), 140);
    doc.text(pNameLines, 50, currentY);
    currentY += (pNameLines.length * 5) + 10;

    doc.setFont('Helvetica', 'bold');
    doc.text('ESTUDIO SOLICITADO:', 20, currentY);
    
    doc.autoTable({
        startY: currentY + 5,
        head: [['Estudio de Radiología', 'Indicaciones']],
        body: [[study.name.toUpperCase(), study.indications.toUpperCase()]],
        theme: 'grid',
        headStyles: { fillColor: PRIMARY_COLOR },
    });

    addPDFFooter(doc);
    doc.save(`cita_rx_${appointmentNumber}.pdf`);
}

export async function generateUltrasoundAppointmentPDF(appointment: UltrasoundAppointment, study: UltrasoundStudy, announcements: string[]) {
    const { jsPDF } = await import('jspdf');
    await import('jspdf-autotable');
    const doc = new jsPDF() as any;
    const { patient, date, time, appointmentNumber } = appointment;

    addPDFHeader(doc, 'Cita de Ultrasonido');
    let currentY = addDateTimeHighlight(doc, date, time, 65);

    doc.setFontSize(12);
    doc.setFont('Helvetica', 'bold');
    doc.text('PACIENTE:', 20, currentY);
    doc.setFont('Helvetica', 'normal');
    const pNameLines = doc.splitTextToSize(`${patient.name} ${patient.paternalLastName} ${patient.maternalLastName}`.toUpperCase(), 140);
    doc.text(pNameLines, 50, currentY);
    currentY += (pNameLines.length * 5) + 10;
    
    doc.setFont('Helvetica', 'bold');
    doc.text('ESTUDIO SOLICITADO:', 20, currentY);
    
    doc.autoTable({
        startY: currentY + 5,
        head: [['Estudio de Ultrasonografía', 'Indicaciones']],
        body: [[study.name.toUpperCase(), study.indications.toUpperCase()]],
        theme: 'grid',
        headStyles: { fillColor: PRIMARY_COLOR },
    });

    addPDFFooter(doc);
    doc.save(`cita_us_${appointmentNumber}.pdf`);
}

export async function generateVaccineAppointmentPDF(appointment: VaccineAppointment, announcements: string[]) {
    const { jsPDF } = await import('jspdf');
    await import('jspdf-autotable');
    const doc = new jsPDF() as any;
    const { patient, date, time, appointmentNumber, vaccines } = appointment;

    addPDFHeader(doc, 'Cita de Vacunación');
    let currentY = addDateTimeHighlight(doc, date, time, 65);

    doc.setFontSize(12);
    doc.setFont('Helvetica', 'bold');
    doc.text('PACIENTE:', 20, currentY);
    doc.setFont('Helvetica', 'normal');
    const pNameLines = doc.splitTextToSize(`${patient.name} ${patient.paternalLastName} ${patient.maternalLastName}`.toUpperCase(), 140);
    doc.text(pNameLines, 50, currentY);
    currentY += (pNameLines.length * 5) + 10;
    
    doc.setFont('Helvetica', 'bold');
    doc.text('VACUNAS A APLICAR:', 20, currentY);
    
    const tableBody = vaccines.map(v => [v.name.toUpperCase(), v.description.toUpperCase(), v.applicationAge]);
    doc.autoTable({
        startY: currentY + 5,
        head: [['Vacuna', 'Protección', 'Edad Recomendada']],
        body: tableBody,
        theme: 'grid',
        headStyles: { fillColor: PRIMARY_COLOR },
    });

    addPDFFooter(doc);
    doc.save(`cita_vacuna_${appointmentNumber}.pdf`);
}

export async function generatePrescriptionPDF(prescription: Prescription) {
    const { jsPDF } = await import('jspdf');
    await import('jspdf-autotable');
    const doc = new jsPDF() as any;

    try {
        if (logoBase64) {
            doc.addImage(logoBase64, 'PNG', 15, 12, 22, 22);
        }
    } catch (e) {}

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(0, 102, 51);
    doc.text('HOSPITAL GENERAL DE HUIMANGUILLO', 110, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('SECRETARÍA DE SALUD DEL ESTADO DE TABASCO', 110, 26, { align: 'center' });
    
    doc.setDrawColor(0, 102, 51);
    doc.setLineWidth(0.8);
    doc.line(20, 34, 190, 34);

    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text(`FOLIO: ${prescription.folio}`, 20, 44);
    doc.text(`FECHA: ${format(parseISO(prescription.date), 'dd/MM/yyyy HH:mm')}`, 190, 44, { align: 'right' });

    doc.setFillColor(245, 245, 245);
    doc.rect(20, 50, 170, 24, 'F');
    
    doc.setFontSize(9);
    doc.setFont('Helvetica', 'bold');
    doc.text('DATOS DEL PACIENTE', 25, 56);
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(11);
    const pNameLines = doc.splitTextToSize(`NOMBRE: ${prescription.patientName.toUpperCase()}`, 85);
    doc.text(pNameLines, 25, 64);
    
    doc.setFontSize(9);
    doc.setFont('Helvetica', 'bold');
    doc.text('MÉDICO QUE PRESCRIBE', 115, 56);
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    const doctorLines = doc.splitTextToSize(`DR(A): ${prescription.doctorName.toUpperCase()}`, 70);
    doc.text(doctorLines, 115, 64);
    const nextY = 64 + (doctorLines.length * 4.5);
    doc.text(`CED: ${prescription.doctorLicense || 'S/C'}`, 115, nextY);

    let currentY = 85;
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('DIAGNÓSTICO:', 20, currentY);
    currentY += 6;
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    const diagnosisLines = doc.splitTextToSize(prescription.diagnosis?.toUpperCase() || 'NO ESPECIFICADO', 170);
    doc.text(diagnosisLines, 20, currentY);
    currentY += (diagnosisLines.length * 5) + 10;

    if (prescription.items.length > 0) {
        doc.setFont('Helvetica', 'bold');
        doc.text('MEDICAMENTOS (SURTIDO EN FARMACIA):', 20, currentY);
        currentY += 4;
        
        const tableBody = prescription.items.map(i => [
            `${i.name.toUpperCase()}\nLote: ${i.lote || 'N/A'}`,
            i.quantity,
            i.frequency || '',
            i.indications || ''
        ]);

        doc.autoTable({
            startY: currentY,
            head: [['Insumo / Medicamento', 'Cant.', 'Frecuencia/Vía', 'Indicaciones']],
            body: tableBody,
            theme: 'grid',
            headStyles: { fillColor: [0, 102, 51], fontSize: 9 },
            styles: { fontSize: 8 },
            columnStyles: { 
                0: { cellWidth: 85 },
                1: { cellWidth: 15, halign: 'center' },
                2: { cellWidth: 25 },
                3: { cellWidth: 'auto' } 
            }
        });
        currentY = doc.autoTable.previous.finalY + 10;
    }

    if (prescription.otherMedications) {
        doc.setFont('Helvetica', 'bold');
        doc.text('OTROS MEDICAMENTOS (ADQUISICIÓN EXTERNA):', 20, currentY);
        currentY += 6;
        doc.setFont('Helvetica', 'normal');
        const otherMedLines = doc.splitTextToSize(prescription.otherMedications.toUpperCase(), 170);
        doc.text(otherMedLines, 20, currentY);
        currentY += (otherMedLines.length * 5) + 10;
    }

    if (prescription.labStudies?.length || prescription.otherStudies) {
        doc.setFont('Helvetica', 'bold');
        doc.text('SOLICITUD DE ESTUDIOS:', 20, currentY);
        currentY += 6;
        doc.setFont('Helvetica', 'normal');
        
        let studiesText = '';
        if (prescription.labStudies?.length) {
            studiesText += `LABORATORIO: ${prescription.labStudies.join(', ').toUpperCase()}\n`;
        }
        if (prescription.otherStudies) {
            studiesText += `OTROS: ${prescription.otherStudies.toUpperCase()}`;
        }
        
        const studiesLines = doc.splitTextToSize(studiesText, 170);
        doc.text(studiesLines, 20, currentY);
        currentY += (studiesLines.length * 5) + 15;
    }

    currentY += 25; 
    if (currentY > 250) {
        doc.addPage();
        currentY = 40;
    }
    
    doc.setDrawColor(0, 102, 51);
    doc.setLineWidth(0.5);
    doc.line(70, currentY, 140, currentY);
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text('FIRMA Y SELLO DEL MÉDICO', 105, currentY + 5, { align: 'center' });
    
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text('Esta receta tiene una vigencia de 24 horas para surtido en farmacia del hospital.', 105, 280, { align: 'center' });
    doc.text('Hospital General Huimanguillo - CitaMedicaFacil', 105, 285, { align: 'center' });

    doc.save(`receta_${prescription.folio}.pdf`);
}
