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
            let marcaId = res.getValue('custrecord_condcom_marca');
            
            let ppString = res.getValue('custrecord_condcom_pronto_pago') || '0';
            let ppFloat = parseFloat(ppString.toString().replace('%', ''));
            let ppDecimal = (ppFloat > 1) ? (ppFloat / 100) : ppFloat; 

            condicionesCache[marcaId] = { id: condId, pp: ppDecimal, metas: [] };
            return true;
        });

        // 2. CARGAMOS LAS METAS
        const condicionesIds = Object.values(condicionesCache).map(c => c.id);
        
        if (condicionesIds.length > 0) {
            search.create({
                type: 'customrecord_fut_meta',
                filters: [
                    ['custrecord_fut_meta_padre', 'anyof', condicionesIds],
                    'AND',
                    // NUEVO FILTRO: Traer solo las metas activas
                    ['custrecord_fut_activo_inactivo', 'is', 'T'] 
                ],
                columns: ['custrecord_fut_meta_padre', 'custrecord_rin_min', 'custrecord_rin_max', 'custrecord_pct_descuento']
            }).run().each(res => {
                let padreId = res.getValue('custrecord_fut_meta_padre');
                
                // CAMBIO CLAVE: Usar getText() porque ahora son listas (SELECT)
                let rinMinText = res.getText('custrecord_rin_min') || res.getValue('custrecord_rin_min') || '0';
                let rinMin = parseInt(rinMinText) || 0;
                
                let rinMaxText = res.getText('custrecord_rin_max') || res.getValue('custrecord_rin_max') || '0';
                let rinMax = parseInt(rinMaxText) || 0;
                
                let descString = res.getText('custrecord_pct_descuento') || res.getValue('custrecord_pct_descuento') || '0';
                
                // Limpiamos el texto por si trae el símbolo "%" de la lista
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
        }

        // 3. PROCESAMOS LÍNEA POR LÍNEA
        for (let i = 0; i < itemCount; i++) {
            
            let itemId = newRecord.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i });
            let arribo = parseFloat(newRecord.getSublistValue({ sublistId: 'item', fieldId: 'quantity', line: i })) || 0;
            let costoFactura = parseFloat(newRecord.getSublistValue({ sublistId: 'item', fieldId: 'rate', line: i })) || 0;

            if (itemId && arribo > 0 && costoFactura > 0) {
                // Obtención del REFMXP anterior (Quitamos quantityonhand de aquí porque es global)
                let itemFields = search.lookupFields({
                    type: search.Type.ITEM,
                    id: itemId,
                    columns: ['recordtype', FLD_ITEM_MARCA, FLD_ITEM_RIN, FLD_ITEM_REFMXP]
                });

                let costoRefAnterior = parseFloat(itemFields[FLD_ITEM_REFMXP]) || 0;
                
                let recordType = itemFields.recordtype;
                if (Array.isArray(recordType)) recordType = recordType[0]?.value;
                else if (typeof recordType === 'object') recordType = recordType.value;

                let marcaArticulo = itemFields[FLD_ITEM_MARCA];
                if (Array.isArray(marcaArticulo)) marcaArticulo = marcaArticulo[0]?.value;
                else if (typeof marcaArticulo === 'object') marcaArticulo = marcaArticulo.value;

                // OBTENER TAMAÑO DEL RIN
                let rinRaw = itemFields[FLD_ITEM_RIN];
                if (Array.isArray(rinRaw)) {
                    rinRaw = rinRaw[0]?.text || rinRaw[0]?.value; 
                } else if (typeof rinRaw === 'object') {
                    rinRaw = rinRaw.text || rinRaw.value;
                }
                let rinArticulo = parseInt(rinRaw) || 0;
                // ----------------------------------------------



                // Obtención de stock actual en la subsidiaria de la transacción
                let stockActual = 0;
                if (subsidiariaTx) {
                    search.create({
                        type: search.Type.ITEM,
                        filters: [
                            ['internalid', 'anyof', itemId],
                            'AND',
                            ['inventorylocation.subsidiary', 'anyof', subsidiariaTx]
                        ],
                        columns: [
                            search.createColumn({ name: 'locationquantityonhand', summary: search.Summary.SUM })
                        ]
                    }).run().each(res => {
                        stockActual = parseFloat(res.getValue({ name: 'locationquantityonhand', summary: search.Summary.SUM })) || 0;
                        return true;
                    });
                }
                // ========================================================


                // Logica para obtener los porcentajes de descuento
                let pctProntoPago = 0;
                let pctRebate = 0;

                if (marcaArticulo && condicionesCache[marcaArticulo]) {
                    const condicionActiva = condicionesCache[marcaArticulo];
                    pctProntoPago = condicionActiva.pp;

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
                // ========================================================

                // Cálculo descuentos y costo neto
                let descuentoProntoPago = costoFactura * pctProntoPago;
                let descuentoRebate = costoFactura * pctRebate;
                let costoNeto = (costoFactura - descuentoProntoPago - descuentoRebate) * factorIVA;

                // ---Promedio usando el Costo Ref Anterior ---
                let valorArribo = arribo * costoNeto;
                let valorStock = stockActual * costoRefAnterior; 
                let numerador = valorArribo + valorStock;
                let denominador = arribo + stockActual;

                let costoRef = (denominador > 0) ? (numerador / denominador) : 0;

                log.debug({
                    title: `Cálculo Costo Ref - Artículo: ${itemId} | Marca: ${marcaArticulo} | Rin: ${rinArticulo}`,
                    details: `Subsidiaria: ${subsidiariaTx} | Stock Aislado: ${stockActual} | RefAnterior: ${costoRefAnterior} | Neto: ${costoNeto} | REFMXP NUEVO: ${costoRef}`
                });

                /*newRecord.setSublistValue({
                    sublistId: 'item',
                    fieldId: 'custcol_precio_unitario_real', 
                    line: i,
                    value: costoRef
                }); */

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
        }
    }

    return {
        beforeSubmit: beforeSubmit
    };
});