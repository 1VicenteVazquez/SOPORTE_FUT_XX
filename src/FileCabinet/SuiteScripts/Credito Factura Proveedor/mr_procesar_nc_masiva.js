/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 *
 * mr_procesar_nc_masiva.js
 */
define([
    'N/runtime',
    'N/record',
    'N/search',
    'N/email',
    'N/file',
    'N/log',
    'N/url',
    'N/xml'
], (runtime, record, search, email, file, log, url, xml) => {

    const MAPA_MONEDAS = { MXN: 1, USD: 2, CAD: 3 };

    const eliminarArchivo = (fileId) => {
        try { file.delete({ id: parseInt(fileId, 10) }); } catch (e) {}
    };

    const construirTranId = (folio, serie, nombreArchivo) => {
        const base = folio ? folio : (nombreArchivo || '').replace(/\.xml$/i, '').substring(0, 30);
        return `NDC-MAS-${base}`.trim(); 
    };

    const validarTipoComprobante = (xmlDoc) => {
        const nodo = xmlDoc.getElementsByTagName({ tagName: 'cfdi:Comprobante' })[0];
        if (!nodo) return 'El XML no contiene el nodo cfdi:Comprobante.';
        const tipo = nodo.getAttribute({ name: 'TipoDeComprobante' });
        if (tipo !== 'E') return `Tipo de comprobante inválido: ${tipo}. Se requiere Egreso (E).`;
        return null;
    };

    const validarUuidDuplicado = (uuidNota) => {
        if (!uuidNota) return null;
        try {
            let encontrado = null;
            search.create({
                type:    search.Type.VENDOR_CREDIT,
                filters: [['custbody_uuid', 'is', uuidNota], 'AND', ['mainline', 'is', 'T']],
                columns: ['tranid']
            }).run().each(r => {
                encontrado = r.getValue('tranid');
                return false;
            });
            if (encontrado) return `UUID duplicado — ya existe la nota ${encontrado}.`;
        } catch (e) {}
        return null;
    };

    const extraerDatosCFDI = (xmlDoc) => {
        const comp    = xmlDoc.getElementsByTagName({ tagName: 'cfdi:Comprobante' })[0];
        const emisor  = xmlDoc.getElementsByTagName({ tagName: 'cfdi:Emisor' })[0];
        const timbre  = xmlDoc.getElementsByTagName({ tagName: 'tfd:TimbreFiscalDigital' })[0];
        const relNodes = xmlDoc.getElementsByTagName({ tagName: 'cfdi:CfdiRelacionado' });

        const uuidsSet = new Set();
        for (let i = 0; i < relNodes.length; i++) {
            const u = relNodes[i].getAttribute({ name: 'UUID' });
            if (u) uuidsSet.add(u.toUpperCase());
        }
        const uuidsAfectados = Array.from(uuidsSet);

        const concNodes = xmlDoc.getElementsByTagName({ tagName: 'cfdi:Concepto' });
        const conceptos = [];
        for (let i = 0; i < concNodes.length; i++) {
            const n    = concNodes[i];
            const desc = n.getAttribute({ name: 'Descripcion' }) || '';
            const imp  = parseFloat(n.getAttribute({ name: 'Importe' }) || '0');
            const tras = n.getElementsByTagName({ tagName: 'cfdi:Traslado' });
            let iva = 0;
            for (let j = 0; j < tras.length; j++) {
                iva += parseFloat(tras[j].getAttribute({ name: 'Importe' }) || '0');
            }
            conceptos.push({
                descripcion: desc,
                total: Math.round((imp + iva) * 100) / 100
            });
        }

        const fechaRaw  = comp.getAttribute({ name: 'Fecha' }) || '';
        const fechaSolo = fechaRaw.includes('T') ? fechaRaw.split('T')[0] : fechaRaw;

        return {
            emisorNombre:   emisor.getAttribute({ name: 'Nombre' }),
            emisorRfc:      emisor.getAttribute({ name: 'Rfc' }),
            uuidNota:       timbre ? timbre.getAttribute({ name: 'UUID' }) : '',
            uuidsAfectados,
            conceptos,
            moneda:         comp.getAttribute({ name: 'Moneda' }) || 'MXN',
            tipoCambio:     comp.getAttribute({ name: 'TipoCambio' }) || '1',
            subtotal:       comp.getAttribute({ name: 'SubTotal' }) || '0',
            total:          comp.getAttribute({ name: 'Total' }) || '0',
            fecha:          fechaSolo,
            folio:          comp.getAttribute({ name: 'Folio' }) || '',
            serie:          comp.getAttribute({ name: 'Serie' }) || ''
        };
    };

    const buscarTranIdsPorUUID = (uuids) => {
        if (!uuids?.length) return {};
        const res = {};
        uuids.forEach(u => res[u] = { tranId: 'No encontrado', internalId: '', saldo: 0 });

        try {
            const filtros = uuids.reduce((acc, u, i) => {
                acc.push(['custbody_uuid', 'is', u]);
                if (i < uuids.length - 1) acc.push('OR');
                return acc;
            }, []);

            search.create({
                type:    search.Type.TRANSACTION,
                filters: [filtros, 'AND', ['mainline', 'is', 'T']],
                columns: ['tranid', 'custbody_uuid', 'internalid', 'amountremaining']
            }).run().each(r => {
                const u = (r.getValue('custbody_uuid') || '').toUpperCase();
                res[u] = {
                    tranId:     r.getValue('tranid'),
                    internalId: r.getValue('internalid'),
                    saldo:      Math.round(parseFloat(r.getValue('amountremaining') || 0) * 100) / 100
                };
                return true;
            });
        } catch (e) {}
        return res;
    };

    const calcularLineas = (uuidsAfectados, conceptos, infoBusqueda) => {
        const totalUUIDs  = uuidsAfectados.length;
        const totalGeneral = Math.round(conceptos.reduce((acc, c) => acc + c.total, 0) * 100) / 100;

        if (totalUUIDs > 1) {
            const motivo = `La nota de crédito ampara ${totalUUIDs} facturas distintas. El estándar SAT requiere intervención manual para prorratear el monto.`;
            return { rechazar: true, motivo };
        }

        const lineasMR            = [];
        const lineasNoEncontradas = [];
        const u     = uuidsAfectados[0];
        const match = infoBusqueda[u] || {};

        if (match.internalId) {
            lineasMR.push({ uuid: u, internalId: match.internalId, tranId: match.tranId,
                importe: totalGeneral, descripcion: conceptos[0]?.descripcion || '', saldo: match.saldo });
        } else {
            lineasNoEncontradas.push({ uuid: u, tranId: 'No encontrado',
                importe: totalGeneral, descripcion: conceptos[0]?.descripcion || '', saldo: 0 });
        }

        return { rechazar: false, lineasMR, lineasNoEncontradas };
    };

    const crearVendorCredit = ({ vendorId, subsidiaryId, locationId, fecha, tranId,
                                  currencyId, tipoCambio, subtotal, uuidNota, fileId, cuentaProveedor, cuentaInventario }) => {
        let fechaDate;
        try {
            const p = String(fecha).split('T')[0].split('-');
            fechaDate = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
        } catch (e) {
            fechaDate = new Date();
        }

        const vc = record.create({ type: record.Type.VENDOR_CREDIT, isDynamic: true });
        vc.setValue({ fieldId: 'entity', value: vendorId });

        const subCargada = vc.getValue({ fieldId: 'subsidiary' });
        const idSub      = parseInt(subsidiaryId, 10);
        if (idSub && (!subCargada || subCargada != idSub)) {
            vc.setValue({ fieldId: 'subsidiary', value: idSub });
        }

        vc.setValue({ fieldId: 'trandate',      value: fechaDate });
        vc.setValue({ fieldId: 'tranid',         value: tranId });
        vc.setValue({ fieldId: 'currency',       value: currencyId });

        const tc = parseFloat(tipoCambio);
        if (!isNaN(tc) && tc > 0) vc.setValue({ fieldId: 'exchangerate', value: tc });

        vc.setValue({ fieldId: 'account', value: cuentaProveedor });
        vc.setValue({ fieldId: 'custbody_uuid',  value: uuidNota });

        if (locationId) vc.setValue({ fieldId: 'location', value: locationId });
        if (fileId)     vc.setValue({ fieldId: 'custbody_cfdi_ref_xml', value: parseInt(fileId, 10) });

        vc.selectNewLine({ sublistId: 'expense' });
        vc.setCurrentSublistValue({ sublistId: 'expense', fieldId: 'account', value: cuentaInventario });
        vc.setCurrentSublistValue({ sublistId: 'expense', fieldId: 'amount',  value: parseFloat(subtotal) });
        if (locationId) {
            vc.setCurrentSublistValue({ sublistId: 'expense', fieldId: 'location', value: locationId });
        }
        vc.commitLine({ sublistId: 'expense' });

        return vc.save({ enableSourcing: true, ignoreMandatoryFields: false });
    };
    
    const getInputData = () => {
        const script     = runtime.getCurrentScript();
        // LECTURA DE PARÁMETRO LIMPIO
        const loteFileId = script.getParameter({ name: 'custscript_mr_lote_file_id_masiva' });

        if (!loteFileId) throw new Error('Parámetro custscript_mr_lote_file_id_masiva vacío.');

        const metaFile = file.load({ id: parseInt(loteFileId, 10) });
        const meta     = JSON.parse(metaFile.getContents());

        eliminarArchivo(loteFileId);

        if (!meta.items || !meta.items.length) {
            return [];
        }

        return meta.items;
    };

    const map = (context) => {
        const item = JSON.parse(context.value);
        const { fileId, nombreArchivo, userEmail } = item;

        const scriptObj = runtime.getCurrentScript();
        const cuentaInventario = scriptObj.getParameter({ name: 'custscript_cta_inventario' });

        const resultado = {
            nombreArchivo, fileId, userEmail, uuidNota: '', tranId: '', vendCreditId: null,
            rechazado: false, motivoRechazo: '', lineasMR: [], lineasNoEncontradas: []
        };
        
        if (!cuentaInventario) {
             eliminarArchivo(fileId);
             context.write({ key: fileId, value: JSON.stringify({ ...resultado, rechazado: true, motivoRechazo: 'Falta configurar el parámetro de Cuenta de Inventario en el script.' }) });
             return;
        }

        try {
            const xmlFileObj = file.load({ id: parseInt(fileId, 10) });
            const contenido  = xmlFileObj.getContents();
            let xmlDoc;

            try {
                xmlDoc = xml.Parser.fromString({ text: contenido });
            } catch (eXml) {
                const motivo = `XML mal formado o inválido: ${eXml.message}`;
                eliminarArchivo(fileId);
                context.write({ key: fileId, value: JSON.stringify({ ...resultado, rechazado: true, motivoRechazo: motivo }) });
                return;
            }

            const errTipo = validarTipoComprobante(xmlDoc);
            if (errTipo) {
                eliminarArchivo(fileId);
                context.write({ key: fileId, value: JSON.stringify({ ...resultado, rechazado: true, motivoRechazo: errTipo }) });
                return;
            }

            const datos = extraerDatosCFDI(xmlDoc);
            resultado.uuidNota = datos.uuidNota;

            const errDup = validarUuidDuplicado(datos.uuidNota);
            if (errDup) {
                eliminarArchivo(fileId);
                context.write({ key: fileId, value: JSON.stringify({ ...resultado, rechazado: true, motivoRechazo: errDup }) });
                return;
            }

            const infoBusqueda = buscarTranIdsPorUUID(datos.uuidsAfectados);
            const encontradas  = Object.values(infoBusqueda).filter(r => r.internalId);

            if (encontradas.length === 0) {
                const motivo = 'Ninguno de los UUIDs relacionados existe en NetSuite.';
                eliminarArchivo(fileId);
                context.write({ key: fileId, value: JSON.stringify({ ...resultado, rechazado: true, motivoRechazo: motivo }) });
                return;
            }

            const facturaRef   = record.load({ type: record.Type.VENDOR_BILL, id: encontradas[0].internalId });
            const vendorId     = facturaRef.getValue('entity');
            const subsidiaryId = facturaRef.getValue('subsidiary');
            const locationId   = facturaRef.getValue('location');
            const cuentaProveedor = facturaRef.getValue('account');

            if (!vendorId || !cuentaProveedor) {
                const motivo = 'La factura de referencia no tiene proveedor o cuenta asignada.';
                eliminarArchivo(fileId);
                context.write({ key: fileId, value: JSON.stringify({ ...resultado, rechazado: true, motivoRechazo: motivo }) });
                return;
            }

            const resultadoLineas = calcularLineas(datos.uuidsAfectados, datos.conceptos, infoBusqueda);

            if (resultadoLineas.rechazar) {
                eliminarArchivo(fileId);
                context.write({ key: fileId, value: JSON.stringify({
                    ...resultado, rechazado: true, motivoRechazo: resultadoLineas.motivo
                })});
                return;
            }

            const { lineasMR, lineasNoEncontradas } = resultadoLineas;
            const tranId = construirTranId(datos.folio, datos.serie, nombreArchivo);
            const currencyId   = MAPA_MONEDAS[datos.moneda] || MAPA_MONEDAS.MXN;
            
            const vendCreditId = crearVendorCredit({
                vendorId, subsidiaryId, locationId, fecha: datos.fecha, tranId,
                currencyId, tipoCambio: datos.tipoCambio, subtotal: datos.subtotal,
                uuidNota: datos.uuidNota, fileId, cuentaProveedor, cuentaInventario
            });

            context.write({
                key: String(vendCreditId),
                value: JSON.stringify({ ...resultado, tranId, vendCreditId, lineasMR, lineasNoEncontradas })
            });

        } catch (e) {
            context.write({ key: fileId, value: JSON.stringify({
                ...resultado, rechazado: true, motivoRechazo: `Error inesperado: ${e.message}`
            })});
        }
    };

    const reduce = (context) => {
        const item  = JSON.parse(context.values[0]); 
        if (item.rechazado) {
            context.write({ key: context.key, value: JSON.stringify(item) });
            return;
        }

        const { vendCreditId, lineasMR, lineasNoEncontradas } = item;
        const resultadosAplicacion = [];

        try {
            const vc = record.load({ type: record.Type.VENDOR_CREDIT, id: vendCreditId, isDynamic: false });
            const count    = vc.getLineCount({ sublistId: 'apply' });
            const applyMap = {};
            
            for (let i = 0; i < count; i++) {
                const iid = String(vc.getSublistValue({ sublistId: 'apply', fieldId: 'internalid', line: i }));
                applyMap[iid] = i;
            }

            lineasMR.forEach(linea => {
                const r = { uuid: linea.uuid, tranId: linea.tranId, importe: linea.importe, saldo: linea.saldo, aplicado: false, error: '' };
                try {
                    const idx = applyMap[String(linea.internalId)];
                    if (idx !== undefined) {
                        vc.setSublistValue({ sublistId: 'apply', fieldId: 'apply',  line: idx, value: true });
                        vc.setSublistValue({ sublistId: 'apply', fieldId: 'amount', line: idx, value: parseFloat(linea.importe) });
                        r.aplicado = true;
                    } else {
                        r.error = `InternalId no encontrado en sublista Apply.`;
                    }
                } catch (ex) {
                    r.error = ex.message;
                }
                resultadosAplicacion.push(r);
            });
            vc.save({ ignoreMandatoryFields: true });
        } catch (e) {
            lineasMR.forEach(l => resultadosAplicacion.push({
                uuid: l.uuid, tranId: l.tranId, importe: l.importe, saldo: l.saldo, aplicado: false, error: e.message
            }));
        }

        context.write({ key: context.key, value: JSON.stringify({ ...item, resultadosAplicacion, lineasNoEncontradas }) });
    };

    const summarize = (summary) => {
        const items = [];
        summary.output.iterator().each((k, v) => {
            try { items.push(JSON.parse(v)); } catch (e) {}
            return true;
        });
        if (!items.length) return;

        const emailSet  = new Set(items.map(i => i.userEmail).filter(Boolean));
        const userEmail = [...emailSet][0];
        if (!userEmail) return;

        const adjuntos = [];
        const escapar = (v) => {
            const s = String(v ?? '');
            return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s;
        };

        items.forEach(item => {
            const { nombreArchivo, tranId, uuidNota, rechazado, motivoRechazo, resultadosAplicacion, lineasNoEncontradas } = item;
            const nombreCSV = `Reporte_${(tranId || nombreArchivo || 'NC').replace(/[^a-zA-Z0-9_\-]/g, '_')}.csv`;
            let csv = 'Archivo XML,UUID Nota,Nota de Credito,UUID Factura,Factura,Saldo Pendiente,Importe,Estatus,Error\n';

            if (rechazado) {
                csv += [escapar(nombreArchivo), escapar(uuidNota || ''), escapar(tranId || ''), '', '', '', '', escapar('Rechazado'), escapar(motivoRechazo)].join(',') + '\n';
            } else {
                (resultadosAplicacion || []).forEach(r => {
                    csv += [escapar(nombreArchivo), escapar(uuidNota), escapar(tranId), escapar(r.uuid), escapar(r.tranId), escapar(r.saldo), escapar(r.importe), escapar(r.aplicado ? 'Aplicado' : 'Fallo'), escapar(r.error)].join(',') + '\n';
                });
                (lineasNoEncontradas || []).forEach(r => {
                    csv += [escapar(nombreArchivo), escapar(uuidNota), escapar(tranId), escapar(r.uuid), escapar('No encontrado'), escapar(r.saldo || 0), escapar(r.importe), escapar('No encontrado'), escapar('Factura no registrada')].join(',') + '\n';
                });
            }
            try { adjuntos.push(file.create({ name: nombreCSV, fileType: file.Type.CSV, contents: csv })); } catch (e) {}
        });

        const exitosos  = items.filter(i => !i.rechazado).length;
        const fallidos  = items.filter(i => i.rechazado).length;
        const detalleRechazados = items.filter(i => i.rechazado).map(i => `  • ${i.nombreArchivo}: ${i.motivoRechazo}`).join('\n');

        const cuerpo = [
            'Proceso de Carga Masiva de Notas de Crédito finalizado.', '',
            `Total de archivos procesados : ${items.length}`,
            `  Creados exitosamente      : ${exitosos}`,
            `  Rechazados / con error    : ${fallidos}`, '',
            fallidos > 0 ? `Detalle de rechazados:\n${detalleRechazados}` : '', '',
            'Se adjunta un CSV por cada nota de crédito con el detalle de aplicación.'
        ].join('\n');

        try {
            email.send({ author: runtime.getCurrentUser().id, recipients: [userEmail], subject: `Resultado Carga Masiva NC — ${exitosos} creadas, ${fallidos} rechazadas`, body: cuerpo, attachments: adjuntos.length ? adjuntos : undefined });
        } catch (e) {}
    };

    return { getInputData, map, reduce, summarize };
});