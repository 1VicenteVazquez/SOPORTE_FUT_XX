/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * 
 * MR_Fut_CalculoCostoRef.js
 */
define(['N/record', 'N/search', 'N/log', 'N/runtime', 'N/file', 'N/email'], 
(record, search, log, runtime, file, email) => {

    const FLD_ITEM_MARCA = 'custitem_nso_marca'; 
    const FLD_ITEM_RIN = 'custitem_diametro_rin'; 
    const FLD_ITEM_REFMXP = 'custitemcustitem_nso_refmxp'; 

    const getInputData = () => {
        const receiptId = runtime.getCurrentScript().getParameter({ name: 'custscript_fut_receipt_id' });
        if (!receiptId) return [];

        const newRecord = record.load({ type: record.Type.ITEM_RECEIPT, id: receiptId });
        const proveedorId = newRecord.getValue({ fieldId: 'entity' }); 
        const itemCount = newRecord.getLineCount({ sublistId: 'item' });

        if (!proveedorId || itemCount === 0) return [];

        // 1. CACHÉ DE CONDICIONES COMERCIALES
        const condicionesCache = {}; 
        search.create({
            type: 'customrecord_fut_condcom',
            filters: [['custrecord_condcom_proveedor', 'anyof', proveedorId], 'AND', ['custrecord_condcom_activo', 'is', 'T']],
            columns: ['internalid', 'custrecord_condcom_marca', 'custrecord_condcom_pronto_pago']
        }).run().each(res => {
            let ppText = res.getText({ name: 'custrecord_condcom_pronto_pago' }) || '0'; 
            let ppDecimal = parseFloat(ppText.replace('%', ''));
            ppDecimal = (ppDecimal > 1) ? (ppDecimal / 100) : ppDecimal; 
            condicionesCache[res.getValue({ name: 'custrecord_condcom_marca' })] = { id: res.id, pp: ppDecimal, metas: [], precios: {} };
            return true;
        });

        const condicionesIds = Object.values(condicionesCache).map(c => c.id);
        if (condicionesIds.length > 0) {
            search.create({
                type: 'customrecord_fut_meta',
                filters: [['custrecord_fut_meta_padre', 'anyof', condicionesIds], 'AND', ['custrecord_fut_activo_inactivo', 'is', 'T']],
                columns: ['custrecord_fut_meta_padre', 'custrecord_rin_min', 'custrecord_rin_max', 'custrecord_pct_descuento']
            }).run().each(res => {
                let padreId = res.getValue({ name: 'custrecord_fut_meta_padre' });
                let rinMin = parseFloat(res.getText({ name: 'custrecord_rin_min' })) || 0; 
                let rinMax = parseFloat(res.getText({ name: 'custrecord_rin_max' })) || 0;
                let descText = res.getText({ name: 'custrecord_pct_descuento' }) || '0';
                let descDecimal = parseFloat(descText.replace('%', ''));
                descDecimal = (descDecimal > 1) ? (descDecimal / 100) : descDecimal;

                for (let marcaId in condicionesCache) {
                    if (condicionesCache[marcaId].id === padreId) {
                        condicionesCache[marcaId].metas.push({ min: rinMin, max: rinMax, descuento: descDecimal });
                        break;
                    }
                }
                return true;
            });

            search.create({
                type: 'customrecord_fut_precio_esp_art',
                filters: [['custrecord_pea_padre', 'anyof', condicionesIds], 'AND', ['custrecord_pea_activo', 'is', 'T']],
                columns: ['custrecord_pea_padre', 'custrecord_pea_articulo', 'custrecord_pea_precio']
            }).run().each(res => {
                let padreId = res.getValue({ name: 'custrecord_pea_padre' });
                let itemId = res.getValue({ name: 'custrecord_pea_articulo' });
                for (let marcaId in condicionesCache) {
                    if (condicionesCache[marcaId].id === padreId) {
                        condicionesCache[marcaId].precios[itemId] = parseFloat(res.getValue({ name: 'custrecord_pea_precio' })) || 0;
                        break;
                    }
                }
                return true;
            });
        }

        // 2. EXCLUSIÓN DE UBICACIONES VIRTUALES
        const ubicacionesAValidar = [];
        for (let i = 0; i < itemCount; i++) {
            let locId = newRecord.getSublistValue({ sublistId: 'item', fieldId: 'location', line: i }) || newRecord.getValue({ fieldId: 'location' });
            if (locId && !ubicacionesAValidar.includes(locId)) ubicacionesAValidar.push(locId);
        }

        const ubicacionesVirtuales = {};
        if (ubicacionesAValidar.length > 0) {
            search.create({
                type: search.Type.LOCATION,
                filters: [['internalid', 'anyof', ubicacionesAValidar], 'AND', ['custrecord_fut_ubicacion_virtual', 'is', 'T']],
                columns: ['internalid']
            }).run().each(res => { ubicacionesVirtuales[res.id] = true; return true; });
        }

        // 3. AGRUPACIÓN DE LÍNEAS + LECTURA DEL SNAPSHOT
        const articulosAgrupados = {};
        for (let i = 0; i < itemCount; i++) {
            let itemId = newRecord.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i });
            let cantidadLinea = parseFloat(newRecord.getSublistValue({ sublistId: 'item', fieldId: 'quantity', line: i })) || 0;
            let costoFacturaLinea = parseFloat(newRecord.getSublistValue({ sublistId: 'item', fieldId: 'rate', line: i })) || 0;
            let locIdLinea = newRecord.getSublistValue({ sublistId: 'item', fieldId: 'location', line: i }) || newRecord.getValue({ fieldId: 'location' });
            
            // AQUÍ LEEMOS LA FOTOGRAFÍA QUE DEJÓ EL USER EVENT
            let stockSnapshot = parseFloat(newRecord.getSublistValue({ sublistId: 'item', fieldId: 'custcol_fut_stock_previo', line: i })) || 0;

            if (ubicacionesVirtuales[locIdLinea]) continue; 

            if (itemId && cantidadLinea > 0 && costoFacturaLinea > 0) {
                if (!articulosAgrupados[itemId]) {
                    articulosAgrupados[itemId] = { id: itemId, cantidadTotal: 0, costoTotalAcumulado: 0, stockAnterior: stockSnapshot };
                }
                articulosAgrupados[itemId].cantidadTotal += cantidadLinea;
                articulosAgrupados[itemId].costoTotalAcumulado += (cantidadLinea * costoFacturaLinea);
            }
        }

        const dataParaMap = [];
        for (let itemId in articulosAgrupados) {
            dataParaMap.push({
                itemId: itemId,
                cantidadTotal: articulosAgrupados[itemId].cantidadTotal,
                costoTotalAcumulado: articulosAgrupados[itemId].costoTotalAcumulado,
                stockAnterior: articulosAgrupados[itemId].stockAnterior,
                cache: condicionesCache
            });
        }
        return dataParaMap;
    };

    const map = (context) => {
        const data = JSON.parse(context.value);
        const itemId = data.itemId;
        const arribo = data.cantidadTotal;
        const costoFactura = data.costoTotalAcumulado / arribo;
        const stockAnterior = data.stockAnterior; 
        const condicionesCache = data.cache;
        const factorIVA = 1.16; 

        try {
            let itemFields = search.lookupFields({
                type: search.Type.ITEM,
                id: itemId,
                columns: ['recordtype', FLD_ITEM_MARCA, FLD_ITEM_RIN, FLD_ITEM_REFMXP]
            });

            let costoRefAnterior = parseFloat(itemFields[FLD_ITEM_REFMXP]) || 0;
            let recordType = Array.isArray(itemFields.recordtype) ? itemFields.recordtype[0]?.value : (typeof itemFields.recordtype === 'object' ? itemFields.recordtype.value : itemFields.recordtype);
            
            let marcaArticulo = Array.isArray(itemFields[FLD_ITEM_MARCA]) ? itemFields[FLD_ITEM_MARCA][0]?.value : (typeof itemFields[FLD_ITEM_MARCA] === 'object' ? itemFields[FLD_ITEM_MARCA].value : itemFields[FLD_ITEM_MARCA]);
            
            let rinRaw = itemFields[FLD_ITEM_RIN];
            if (Array.isArray(rinRaw)) rinRaw = rinRaw[0]?.text || rinRaw[0]?.value; 
            else if (typeof rinRaw === 'object') rinRaw = rinRaw.text || rinRaw.value;
            let rinArticulo = parseFloat(rinRaw) || 0;

            let pctProntoPago = 0;
            let pctRebate = 0;
            let precioEspecialActivo = 0; 

            if (marcaArticulo && condicionesCache[marcaArticulo]) {
                const condicionActiva = condicionesCache[marcaArticulo];
                pctProntoPago = condicionActiva.pp;

                if (condicionActiva.precios && condicionActiva.precios[itemId]) {
                    precioEspecialActivo = condicionActiva.precios[itemId];
                }

                if (rinArticulo > 0 && condicionActiva.metas.length > 0) {
                    for (let m = 0; m < condicionActiva.metas.length; m++) {
                        let escalon = condicionActiva.metas[m];
                        if (rinArticulo >= escalon.min && rinArticulo <= escalon.max) {
                            pctRebate = escalon.descuento; 
                            break; 
                        }
                    }
                }
            }

            let costoBaseCalculo = (precioEspecialActivo > 0) ? precioEspecialActivo : costoFactura;
            let descuentoProntoPago = costoBaseCalculo * pctProntoPago;
            let descuentoRebate = costoBaseCalculo * pctRebate;
            let costoNeto = (costoBaseCalculo - descuentoProntoPago - descuentoRebate) * factorIVA;

            let valorArribo = arribo * costoNeto;
            let valorStock = stockAnterior * costoRefAnterior; 
            
            let numerador = valorArribo + valorStock;
            let denominador = arribo + stockAnterior;

            let costoRef = (denominador > 0) ? parseFloat((numerador / denominador).toFixed(2)) : 0;

            if (recordType) {
                record.submitFields({
                    type: recordType,
                    id: itemId,
                    values: { [FLD_ITEM_REFMXP]: costoRef },
                    options: { enableSourcing: false, ignoreMandatoryFields: true }
                });
            }

            // === CAMBIO AQUÍ: Mandamos las variables por separado en lugar de un solo texto ===
            context.write({ 
                key: itemId, 
                value: { 
                    status: 'ÉXITO', 
                    costoFactura: costoFactura.toFixed(2), 
                    arribo: arribo, 
                    stockAnterior: stockAnterior, 
                    costoRef: costoRef.toFixed(2) 
                } 
            });

        } catch (e) {
            // Mandamos el mensaje de error separado
            context.write({ 
                key: itemId, 
                value: { status: 'ERROR', errorMsg: e.message } 
            });
        }
    };

    const summarize = (summary) => {
        // Agregamos la columna "Detalle de Error" al final por precaución
        let csvContent = 'ID Articulo,Estatus,Costo Factura,Arribo,Stock Ant,REF,Detalle de Error\n';
        let totalExitos = 0;
        let totalErrores = 0;

        summary.output.iterator().each((key, value) => {
            let resultado = JSON.parse(value);
            
            // === CAMBIO AQUÍ: Evaluamos si fue éxito o error para armar las columnas correctamente ===
            if (resultado.status === 'ÉXITO') {
                // Acomodamos cada variable separada por una coma
                csvContent += `${key},${resultado.status},${resultado.costoFactura},${resultado.arribo},${resultado.stockAnterior},${resultado.costoRef},\n`;
                totalExitos++;
            } else {
                // Si hubo error, dejamos las columnas numéricas vacías y ponemos el error al final
                let errorLimpio = resultado.errorMsg ? resultado.errorMsg.replace(/,/g, ' ') : 'Error desconocido';
                csvContent += `${key},${resultado.status},,,,,${errorLimpio}\n`;
                totalErrores++;
            }

            return true;
        });

        // 4. ENVÍO DE CORREO CON ADJUNTO EN FORMATO CSV CON ACENTOS UTF-8 
        const fileObj = file.create({
            name: `Reporte_Costos_REF_${new Date().getTime()}.csv`,
            fileType: file.Type.CSV,
            contents: '\uFEFF' + csvContent, 
            encoding: file.Encoding.UTF8 
        });

        const user = runtime.getCurrentUser().id;

        email.send({
            author: user, 
            recipients: user,
            subject: 'Reporte de Cálculo de Costo REF (Recepciones)',
            body: `El proceso masivo ha terminado.\n\nArtículos procesados con éxito: ${totalExitos}\nErrores: ${totalErrores}\n\nRevisa el archivo adjunto para más detalles.`,
            attachments: [fileObj]
        });
    };

    return { getInputData, map, summarize };
});