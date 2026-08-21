/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 * 
 * UE_Fut_CalculoCostoRef.js
 */
define(['N/record', 'N/search', 'N/log'], (record, search, log) => { 

    // CONSTANTES DE CAMPOS PERSONALIZADOS 
    const FLD_ITEM_MARCA = 'custitem_nso_marca'; 
    const FLD_ITEM_RIN = 'custitem_diametro_rin'; 
    const FLD_ITEM_REFMXP = 'custitemcustitem_nso_refmxp'; 
    // ----------------------------------------

    const beforeSubmit = (scriptContext) => {
        
        // Ejecutar al crear una recepción
        if (scriptContext.type !== scriptContext.UserEventType.CREATE) {
            return;
        }

        const newRecord = scriptContext.newRecord;
        const proveedorId = newRecord.getValue({ fieldId: 'entity' }); 
        
        // --- EXTRAEMOS LA SUBSIDIARIA DE LA TRANSACCIÓN ---
        const subsidiariaTx = newRecord.getValue({ fieldId: 'subsidiary' });

        const itemCount = newRecord.getLineCount({ sublistId: 'item' });
        const factorIVA = 1.16; 

        if (!proveedorId || itemCount === 0) return;

        // 1. CARGAMOS EN CACHÉ TODAS LAS CONDICIONES ACTIVAS
        const condicionesCache = {}; 
        
        search.create({
            type: 'customrecord_fut_condcom',
            filters: [
                ['custrecord_condcom_proveedor', 'anyof', proveedorId],
                'AND',
                ['custrecord_condcom_activo', 'is', 'T']
            ],
            columns: ['internalid', 'custrecord_condcom_marca', 'custrecord_condcom_pronto_pago']
        }).run().each(res => {
            let condId = res.id;
            let marcaId = res.getValue({ name: 'custrecord_condcom_marca' });
            
            // Extracción segura de texto para Pronto Pago
            let ppText = res.getText({ name: 'custrecord_condcom_pronto_pago' });
            let ppString = ppText ? ppText : '0'; 
            let ppFloat = parseFloat(ppString.toString().replace('%', ''));
            let ppDecimal = (ppFloat > 1) ? (ppFloat / 100) : ppFloat; 

            condicionesCache[marcaId] = { id: condId, pp: ppDecimal, metas: [] };
            return true;
        });

        // 2. CARGAMOS LAS METAS Y PRECIOS ESPECIALES
        const condicionesIds = Object.values(condicionesCache).map(c => c.id);
        
        if (condicionesIds.length > 0) {
            // 2.1 Cargar Metas
            search.create({
                type: 'customrecord_fut_meta',
                filters: [
                    ['custrecord_fut_meta_padre', 'anyof', condicionesIds],
                    'AND',
                    ['custrecord_fut_activo_inactivo', 'is', 'T'] 
                ],
                columns: ['custrecord_fut_meta_padre', 'custrecord_rin_min', 'custrecord_rin_max', 'custrecord_pct_descuento']
            }).run().each(res => {
                let padreId = res.getValue({ name: 'custrecord_fut_meta_padre' });
                
                // Extracción segura de texto para los Rines y Descuentos
                let rinMinText = res.getText({ name: 'custrecord_rin_min' });
                let rinMin = parseFloat(rinMinText) || 0; 

                let rinMaxText = res.getText({ name: 'custrecord_rin_max' });
                let rinMax = parseFloat(rinMaxText) || 0;
                
                let descText = res.getText({ name: 'custrecord_pct_descuento' });
                let descString = descText ? descText : '0';
                
                let descFloat = parseFloat(descString.toString().replace('%', ''));
                let descDecimal = (descFloat > 1) ? (descFloat / 100) : descFloat;

                for (let marcaId in condicionesCache) {
                    if (condicionesCache[marcaId].id === padreId) {
                        condicionesCache[marcaId].metas.push({ min: rinMin, max: rinMax, descuento: descDecimal });
                        break;
                    }
                }
                return true;
            });

            // 2.2 Cargar Precios Especiales por Artículo
            search.create({
                type: 'customrecord_fut_precio_esp_art',
                filters: [
                    ['custrecord_pea_padre', 'anyof', condicionesIds],
                    'AND',
                    ['custrecord_pea_activo', 'is', 'T']
                ],
                columns: ['custrecord_pea_padre', 'custrecord_pea_articulo', 'custrecord_pea_precio']
            }).run().each(res => {
                let padreId = res.getValue({ name: 'custrecord_pea_padre' });
                let itemId = res.getValue({ name: 'custrecord_pea_articulo' });
                let precioEspecial = parseFloat(res.getValue({ name: 'custrecord_pea_precio' })) || 0;

                for (let marcaId in condicionesCache) {
                    if (condicionesCache[marcaId].id === padreId) {
                        if (!condicionesCache[marcaId].precios) condicionesCache[marcaId].precios = {};
                        condicionesCache[marcaId].precios[itemId] = precioEspecial;
                        break;
                    }
                }
                return true;
            });
        }

        // 3. FIX: AGRUPACIÓN DE LÍNEAS DUPLICADAS POR ARTÍCULO
        const articulosAgrupados = {};
        
        for (let i = 0; i < itemCount; i++) {
            let itemId = newRecord.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i });
            let cantidadLinea = parseFloat(newRecord.getSublistValue({ sublistId: 'item', fieldId: 'quantity', line: i })) || 0;
            let costoFacturaLinea = parseFloat(newRecord.getSublistValue({ sublistId: 'item', fieldId: 'rate', line: i })) || 0;

            if (itemId && cantidadLinea > 0 && costoFacturaLinea > 0) {
                if (!articulosAgrupados[itemId]) {
                    articulosAgrupados[itemId] = { cantidadTotal: 0, costoTotalAcumulado: 0 };
                }
                // Sumamos la cantidad total y el monto total de la factura para promediar después
                articulosAgrupados[itemId].cantidadTotal += cantidadLinea;
                articulosAgrupados[itemId].costoTotalAcumulado += (cantidadLinea * costoFacturaLinea);
            }
        }

        // 4. PROCESAMOS ÚNICAMENTE POR ARTÍCULO AGRUPADO
        for (let itemId in articulosAgrupados) {
            
            let arribo = articulosAgrupados[itemId].cantidadTotal;
            // Promedio exacto en caso de que diferentes líneas tengan diferente costo de factura
            let costoFactura = articulosAgrupados[itemId].costoTotalAcumulado / arribo;

            // Obtención del REFMXP anterior
            let itemFields = search.lookupFields({
                type: search.Type.ITEM,
                id: itemId,
                columns: ['recordtype', FLD_ITEM_MARCA, FLD_ITEM_RIN, FLD_ITEM_REFMXP]
            });

            let costoRefAnterior = parseFloat(itemFields[FLD_ITEM_REFMXP]) || 0;
            let recordType = Array.isArray(itemFields.recordtype) ? itemFields.recordtype[0]?.value : (typeof itemFields.recordtype === 'object' ? itemFields.recordtype.value : itemFields.recordtype);
            
            // Extracción correcta de la marca del artículo
            let marcaArticulo = Array.isArray(itemFields[FLD_ITEM_MARCA]) ? itemFields[FLD_ITEM_MARCA][0]?.value : (typeof itemFields[FLD_ITEM_MARCA] === 'object' ? itemFields[FLD_ITEM_MARCA].value : itemFields[FLD_ITEM_MARCA]);
            
            let rinRaw = itemFields[FLD_ITEM_RIN];
            if (Array.isArray(rinRaw)) rinRaw = rinRaw[0]?.text || rinRaw[0]?.value; 
            else if (typeof rinRaw === 'object') rinRaw = rinRaw.text || rinRaw.value;
            // Usar parseFloat permite leer rines con decimales (Ej. 17.5) sin redondearlos
            let rinArticulo = parseFloat(rinRaw) || 0;

            // Stock actual en subsidiaria
            let stockActual = 0;
            if (subsidiariaTx) {
                search.create({
                    type: search.Type.ITEM,
                    filters: [['internalid', 'anyof', itemId], 'AND', ['inventorylocation.subsidiary', 'anyof', subsidiariaTx]],
                    columns: [search.createColumn({ name: 'locationquantityonhand', summary: search.Summary.SUM })]
                }).run().each(res => {
                    stockActual = parseFloat(res.getValue({ name: 'locationquantityonhand', summary: search.Summary.SUM })) || 0;
                    return true;
                });
            }

            // Lógica para obtener los porcentajes y precios
            let pctProntoPago = 0;
            let pctRebate = 0;
            let precioEspecialActivo = 0; 

            if (marcaArticulo && condicionesCache[marcaArticulo]) {
                const condicionActiva = condicionesCache[marcaArticulo];
                pctProntoPago = condicionActiva.pp;

                // 1. Verificamos si este artículo exacto tiene un Precio Especial
                if (condicionActiva.precios && condicionActiva.precios[itemId]) {
                    precioEspecialActivo = condicionActiva.precios[itemId];
                }

                // 2. Calculamos rebaje por Metas
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

            // Cálculo descuentos y costo neto
            let costoBaseCalculo = (precioEspecialActivo > 0) ? precioEspecialActivo : costoFactura;
            
            let descuentoProntoPago = costoBaseCalculo * pctProntoPago;
            let descuentoRebate = costoBaseCalculo * pctRebate;
            let costoNeto = (costoBaseCalculo - descuentoProntoPago - descuentoRebate) * factorIVA;

            let valorArribo = arribo * costoNeto;
            let valorStock = stockActual * costoRefAnterior; 
            let numerador = valorArribo + valorStock;
            let denominador = arribo + stockActual;

            let costoRef = (denominador > 0) ? parseFloat((numerador / denominador).toFixed(2)) : 0;

            log.debug({
                title: `Cálculo Costo Ref - Artículo: ${itemId} | Marca: ${marcaArticulo}`,
                details: `Costo Factura Promediado: ${costoFactura} | Cantidad Agrupada: ${arribo} | Neto: ${costoNeto} | REFMXP NUEVO: ${costoRef}`
            });

            if (recordType) {
                try {
                    record.submitFields({
                        type: recordType,
                        id: itemId,
                        values: { [FLD_ITEM_REFMXP]: costoRef },
                        options: { enableSourcing: false, ignoreMandatoryFields: true }
                    });
                } catch (e) {
                    log.error(`Error actualizando el Artículo ${itemId}`, e.message);
                }
            }
        }
    };

    return {
        beforeSubmit: beforeSubmit
    };
});