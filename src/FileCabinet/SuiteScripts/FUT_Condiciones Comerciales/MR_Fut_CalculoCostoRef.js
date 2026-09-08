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

    // Formatea numeros a 2 decimales con comas de miles y punto decimal. Ej: 1234.5 -> "1,234.50"
    const formatMoney = (num) => {
        const n = parseFloat(num);
        if (isNaN(n)) return '0.00';
        return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

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

        log.debug('getInputData - Cache Condiciones Comerciales', JSON.stringify(condicionesCache));

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

            log.debug('getInputData - Cache Metas (Escalones Rebate)', JSON.stringify(condicionesCache));

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

            log.debug('getInputData - Cache Precios Especiales por Articulo', JSON.stringify(condicionesCache));
        }

        // 2. EXCLUSIÓN DE UBICACIONES VIRTUALES
        const ubicacionesAValidar = [];
        for (let i = 0; i < itemCount; i++) {
            let locId = newRecord.getSublistValue({ sublistId: 'item', fieldId: 'location', line: i }) || newRecord.getValue({ fieldId: 'location' });
            if (locId && !ubicacionesAValidar.includes(locId)) ubicacionesAValidar.push(locId);
        }

        log.debug('getInputData - Ubicaciones a Validar', JSON.stringify(ubicacionesAValidar));

        const ubicacionesVirtuales = {};
        if (ubicacionesAValidar.length > 0) {
            search.create({
                type: search.Type.LOCATION,
                filters: [['internalid', 'anyof', ubicacionesAValidar], 'AND', ['custrecord_fut_ubicacion_virtual', 'is', 'T']],
                columns: ['internalid']
            }).run().each(res => { ubicacionesVirtuales[res.id] = true; return true; });
        }

        log.debug('getInputData - Ubicaciones Virtuales (Excluidas)', JSON.stringify(ubicacionesVirtuales));

        // 3. AGRUPACIÓN DE LÍNEAS + LECTURA DEL SNAPSHOT
        const articulosAgrupados = {};
        for (let i = 0; i < itemCount; i++) {
            let itemId = newRecord.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i });
            let cantidadLinea = parseFloat(newRecord.getSublistValue({ sublistId: 'item', fieldId: 'quantity', line: i })) || 0;
            let costoFacturaLinea = parseFloat(newRecord.getSublistValue({ sublistId: 'item', fieldId: 'rate', line: i })) || 0;
            let locIdLinea = newRecord.getSublistValue({ sublistId: 'item', fieldId: 'location', line: i }) || newRecord.getValue({ fieldId: 'location' });
            
            // AQUÍ LEEMOS LA FOTOGRAFÍA QUE DEJÓ EL USER EVENT
            let stockSnapshot = parseFloat(newRecord.getSublistValue({ sublistId: 'item', fieldId: 'custcol_fut_stock_previo', line: i })) || 0;

            log.debug(`getInputData - Linea ${i}`, `Item: ${itemId} | Cant: ${cantidadLinea} | Costo Factura: ${costoFacturaLinea} | Loc: ${locIdLinea} | StockPrevio(snapshot): ${stockSnapshot}`);

            if (ubicacionesVirtuales[locIdLinea]) {
                log.debug(`getInputData - Linea ${i} EXCLUIDA`, `Item: ${itemId} | Motivo: Ubicacion Virtual (${locIdLinea})`);
                continue;
            }

            if (itemId && cantidadLinea > 0 && costoFacturaLinea > 0) {
                if (!articulosAgrupados[itemId]) {
                    articulosAgrupados[itemId] = { id: itemId, cantidadTotal: 0, costoTotalAcumulado: 0, stockAnterior: stockSnapshot };
                }
                articulosAgrupados[itemId].cantidadTotal += cantidadLinea;
                articulosAgrupados[itemId].costoTotalAcumulado += (cantidadLinea * costoFacturaLinea);
            } else {
                log.debug(`getInputData - Linea ${i} EXCLUIDA`, `Item: ${itemId} | Motivo: itemId/cantidad/costo invalido (Cant: ${cantidadLinea}, Costo: ${costoFacturaLinea})`);
            }
        }

        log.debug('getInputData - Articulos Agrupados (Resultado Final)', JSON.stringify(articulosAgrupados));

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

        log.debug('getInputData - Total de registros enviados al Map', dataParaMap.length);

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

        log.debug(`map [Item ${itemId}] - PASO 0: Datos de Entrada`, 
            `Arribo(cant): ${arribo} | CostoTotalAcumulado: $${formatMoney(data.costoTotalAcumulado)} | CostoFactura(promedio): $${formatMoney(costoFactura)} | StockAnterior: ${stockAnterior}`);

        try {
            let itemFields = search.lookupFields({
                type: search.Type.ITEM,
                id: itemId,
                columns: ['recordtype', FLD_ITEM_MARCA, FLD_ITEM_RIN, FLD_ITEM_REFMXP]
            });

            log.debug(`map [Item ${itemId}] - PASO 1: itemFields (raw)`, JSON.stringify(itemFields));

            let costoRefAnterior = parseFloat(itemFields[FLD_ITEM_REFMXP]) || 0;
            let recordType = Array.isArray(itemFields.recordtype) ? itemFields.recordtype[0]?.value : (typeof itemFields.recordtype === 'object' ? itemFields.recordtype.value : itemFields.recordtype);
            
            let marcaArticulo = Array.isArray(itemFields[FLD_ITEM_MARCA]) ? itemFields[FLD_ITEM_MARCA][0]?.value : (typeof itemFields[FLD_ITEM_MARCA] === 'object' ? itemFields[FLD_ITEM_MARCA].value : itemFields[FLD_ITEM_MARCA]);
            
            let rinRaw = itemFields[FLD_ITEM_RIN];
            if (Array.isArray(rinRaw)) rinRaw = rinRaw[0]?.text || rinRaw[0]?.value; 
            else if (typeof rinRaw === 'object') rinRaw = rinRaw.text || rinRaw.value;
            let rinArticulo = parseFloat(rinRaw) || 0;

            log.debug(`map [Item ${itemId}] - PASO 2: Datos del Articulo Parseados`, 
                `RecordType: ${recordType} | Marca: ${marcaArticulo} | Rin: ${rinArticulo} | CostoRefAnterior(header actual): $${formatMoney(costoRefAnterior)}`);

            let pctProntoPago = 0;
            let pctRebate = 0;
            let precioEspecialActivo = 0; 

            if (marcaArticulo && condicionesCache[marcaArticulo]) {
                const condicionActiva = condicionesCache[marcaArticulo];
                pctProntoPago = condicionActiva.pp;

                log.debug(`map [Item ${itemId}] - PASO 3: Condicion Comercial Encontrada`, 
                    `Marca: ${marcaArticulo} | %ProntoPago: ${(pctProntoPago * 100).toFixed(2)}% | Cant.Metas: ${condicionActiva.metas.length} | Cant.PreciosEsp: ${Object.keys(condicionActiva.precios || {}).length}`);

                if (condicionActiva.precios && condicionActiva.precios[itemId]) {
                    precioEspecialActivo = condicionActiva.precios[itemId];
                    log.debug(`map [Item ${itemId}] - PASO 3a: Precio Especial Activo`, `Precio: $${formatMoney(precioEspecialActivo)}`);
                }

                if (rinArticulo > 0 && condicionActiva.metas.length > 0) {
                    for (let m = 0; m < condicionActiva.metas.length; m++) {
                        let escalon = condicionActiva.metas[m];
                        if (rinArticulo >= escalon.min && rinArticulo <= escalon.max) {
                            pctRebate = escalon.descuento; 
                            log.debug(`map [Item ${itemId}] - PASO 3b: Escalon Rebate Encontrado`, 
                                `Rin: ${rinArticulo} entra en [${escalon.min} - ${escalon.max}] | %Rebate: ${(pctRebate * 100).toFixed(2)}%`);
                            break; 
                        }
                    }
                }
            } else {
                log.debug(`map [Item ${itemId}] - PASO 3: Sin Condicion Comercial`, `Marca: ${marcaArticulo} no tiene condicion activa en cache`);
            }

            let costoBaseCalculo = (precioEspecialActivo > 0) ? precioEspecialActivo : costoFactura;
            let descuentoProntoPago = costoBaseCalculo * pctProntoPago;
            let descuentoRebate = costoBaseCalculo * pctRebate;
            let costoNeto = (costoBaseCalculo - descuentoProntoPago - descuentoRebate) * factorIVA;

            log.debug(`map [Item ${itemId}] - PASO 4: Calculo Costo Neto`, 
                `CostoBase(${precioEspecialActivo > 0 ? 'PrecioEspecial' : 'CostoFactura'}): $${formatMoney(costoBaseCalculo)} | DescProntoPago: $${formatMoney(descuentoProntoPago)} | DescRebate: $${formatMoney(descuentoRebate)} | FactorIVA: ${factorIVA} | CostoNeto: $${formatMoney(costoNeto)}`);

            let valorArribo = arribo * costoNeto;
            let valorStock = stockAnterior * costoRefAnterior; 
            
            let numerador = valorArribo + valorStock;
            let denominador = arribo + stockAnterior;

            let costoRef = (denominador > 0) ? parseFloat((numerador / denominador).toFixed(2)) : 0;

            log.debug(`map [Item ${itemId}] - PASO 5: Promedio Ponderado (Costo REF Final)`, 
                `ValorArribo(${arribo} x $${formatMoney(costoNeto)}): $${formatMoney(valorArribo)} | ValorStock(${stockAnterior} x $${formatMoney(costoRefAnterior)}): $${formatMoney(valorStock)} | Numerador: $${formatMoney(numerador)} | Denominador: ${denominador} | CostoRef: $${formatMoney(costoRef)}`);

            if (recordType) {
                record.submitFields({
                    type: recordType,
                    id: itemId,
                    values: { [FLD_ITEM_REFMXP]: costoRef },
                    options: { enableSourcing: false, ignoreMandatoryFields: true }
                });
                log.audit(`map [Item ${itemId}] - PASO 6: Costo REF Actualizado en Articulo`, `Nuevo valor guardado: $${formatMoney(costoRef)}`);
            } else {
                log.error(`map [Item ${itemId}] - PASO 6: NO se actualizo`, 'recordType vino vacio/nulo, no se pudo hacer submitFields');
            }

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
            log.error(`map [Item ${itemId}] - ERROR`, e.message);
            context.write({ 
                key: itemId, 
                value: { status: 'ERROR', errorMsg: e.message } 
            });
        }
    };

    const summarize = (summary) => {
        let csvContent = 'ID Articulo,Estatus,Costo Factura,Arribo,Stock Ant,REF,Detalle de Error\n';
        let totalExitos = 0;
        let totalErrores = 0;

        summary.output.iterator().each((key, value) => {
            let resultado = JSON.parse(value);
            
            if (resultado.status === 'ÉXITO') {
                // Los montos con comas de miles se envuelven en comillas para no romper las columnas del CSV
                csvContent += `${key},${resultado.status},"${formatMoney(resultado.costoFactura)}",${resultado.arribo},${resultado.stockAnterior},"${formatMoney(resultado.costoRef)}",\n`;
                totalExitos++;
            } else {
                let errorLimpio = resultado.errorMsg ? resultado.errorMsg.replace(/,/g, ' ') : 'Error desconocido';
                csvContent += `${key},${resultado.status},,,,,${errorLimpio}\n`;
                totalErrores++;
            }

            return true;
        });

        log.debug('summarize - CSV Generado', csvContent);

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

        // === 5. ACTUALIZAMOS EL ESTATUS EN EL ITEM RECEIPT ===
        const receiptId = runtime.getCurrentScript().getParameter({ name: 'custscript_fut_receipt_id' });

        // LOG DE DIAGNÓSTICO 1: Verificar que el parámetro llega bien
        log.debug('summarize - receiptId recibido', receiptId);
        log.debug('summarize - Totales', `Exitos: ${totalExitos} | Errores: ${totalErrores}`);

        if (receiptId) {
            try {
                const estatusFinal = totalErrores > 0 ? 'ERROR' : 'EXITO';

                // LOG DE DIAGNÓSTICO 2: Antes de intentar guardar
                log.debug('summarize - Intentando actualizar', `ID: ${receiptId} | Nuevo estatus: ${estatusFinal}`);

                record.submitFields({
                    type: record.Type.ITEM_RECEIPT,
                    id: receiptId,
                    values: {
                        custbody_fut_status_calculo: estatusFinal
                    },
                    options: { enableSourcing: false, ignoreMandatoryFields: true }
                });

                // LOG DE DIAGNÓSTICO 3: Confirmar que no hubo excepción
                log.audit('Estatus actualizado OK', `Item Receipt ${receiptId} → ${estatusFinal}`);

                // LOG DE DIAGNÓSTICO 4: Releer el campo para confirmar que sí se guardó
                const verificacion = search.lookupFields({
                    type: search.Type.ITEM_RECEIPT,
                    id: receiptId,
                    columns: ['custbody_fut_status_calculo']
                });
                log.debug('summarize - Verificación post-guardado', JSON.stringify(verificacion));

            } catch (e) {
                // LOG DE DIAGNÓSTICO 5: Si falla, aquí veremos por qué (permisos, campo mal escrito, etc.)
                log.error('summarize - ERROR al actualizar estatus', e.message);
            }
        } else {
            log.error('summarize - receiptId es NULO', 'No se pudo actualizar el campo porque no llegó el parámetro custscript_fut_receipt_id');
        }

        // LOG DE DIAGNÓSTICO 6: Resumen de errores/uso del sistema del MR (usage, tiempos)
        summary.mapSummary.errors.iterator().each((key, error) => {
            log.error(`summarize - Error en fase MAP (key: ${key})`, error);
            return true;
        });
    };

    return { getInputData, map, summarize };
});