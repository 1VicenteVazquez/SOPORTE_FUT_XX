/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * SL_CondicionesComerciales_VistaC.js
 */
define(['N/ui/serverWidget', 'N/record', 'N/log'], (serverWidget, record, log) => {

    const CUSTOM_RECORD_PRONTO_PAGO = 'customrecord_fut_pronto_pago';

    const onRequest = (context) => {
        if (context.request.method === 'GET') renderForm(context);
        else if (context.request.method === 'POST') guardarPorcentaje(context);
    };

    function renderForm(context) {
        const params = context.request.parameters;
        const registroId = params.registroId;
        const isEdit = (params.mode === 'edit');

<<<<<<< HEAD
        // ¡AQUÍ TAMBIÉN! hideNavBar: true
=======
        // hideNavBar: true
>>>>>>> fdfb88114537db9c577dedead9a9284142c75d1a
        const form = serverWidget.createForm({ 
            title: isEdit ? 'Configurar Pronto Pago' : 'Pronto Pago',
            hideNavBar: true
        });

        form.addField({ id: 'custpage_close_script', type: serverWidget.FieldType.INLINEHTML, label: ' ' })
            .defaultValue = "<script>function cerrarPopup() { window.close(); }</script>";

        form.addField({ id: 'custpage_registro_id', type: serverWidget.FieldType.TEXT, label: 'ID' })
            .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }).defaultValue = registroId;

<<<<<<< HEAD
        const fldPorcentaje = form.addField({ id: 'custpage_porcentaje', type: serverWidget.FieldType.PERCENT, label: 'Porcentaje de Pronto Pago (%)' });
=======
        // 1. Lista desplegable
        const fldPorcentaje = form.addField({ id: 'custpage_porcentaje', type: serverWidget.FieldType.SELECT, label: 'Porcentaje de Pronto Pago (%)' });
        fldPorcentaje.addSelectOption({ value: '', text: '- N/A -' });
        
        // 2. CICLO PARA AGREGAR VALORES DEL 0.1 AL 10.0
        for (let i = 1; i <= 100; i++) {
            let val = i / 10;
            // value='1.5', text='1.5%'
            fldPorcentaje.addSelectOption({ value: val.toString(), text: val.toFixed(1) + '%' });
        }
>>>>>>> fdfb88114537db9c577dedead9a9284142c75d1a

        if (registroId) {
            try {
                const recPP = record.load({ type: CUSTOM_RECORD_PRONTO_PAGO, id: registroId });
                const valActual = recPP.getValue('custrecord_fut_pp_porcentaje');
<<<<<<< HEAD
                if (valActual) fldPorcentaje.defaultValue = valActual;
=======
                
                // 3. MAPEAR EL VALOR PARA QUE EMPATE CON LAS OPCIONES DEL SELECT
                if (valActual !== null && valActual !== '') {
                    let valorParaSelect = parseFloat(valActual).toString();
                    if (!isNaN(valorParaSelect)) {
                        fldPorcentaje.defaultValue = valorParaSelect;
                    }
                }
>>>>>>> fdfb88114537db9c577dedead9a9284142c75d1a
            } catch (e) { log.error('Error cargando PP', e.message); }
        }

        if (isEdit) {
            fldPorcentaje.isMandatory = true;
            form.addSubmitButton({ label: 'Guardar y Cerrar' });
            form.addButton({ id: 'btn_cerrar', label: 'Cancelar', functionName: 'cerrarPopup' });
        } else {
            fldPorcentaje.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
            form.addButton({ id: 'btn_cerrar', label: 'Cerrar Ventana', functionName: 'cerrarPopup' });
        }

        context.response.writePage(form);
    }

    function guardarPorcentaje(context) {
        const req = context.request;
        const registroId = req.parameters.custpage_registro_id;
        const porcentaje = req.parameters.custpage_porcentaje;

        if (registroId && porcentaje) {
            try {
                const recPP = record.load({ type: CUSTOM_RECORD_PRONTO_PAGO, id: registroId });
<<<<<<< HEAD
=======
                // El value del select ya viaja como número válido ('1.5'), solo lo parseamos
>>>>>>> fdfb88114537db9c577dedead9a9284142c75d1a
                recPP.setValue({ fieldId: 'custrecord_fut_pp_porcentaje', value: parseFloat(porcentaje) });
                recPP.save({ ignoreMandatoryFields: true });
            } catch (e) { log.error('Error guardando PP', e.message); }
        }

        context.response.write(`
            <html><body style="font-family:sans-serif; text-align:center; padding-top:40px;">
                <h3 style="color:#28a745;">¡Porcentaje guardado con éxito!</h3>
                <script>
                    setTimeout(function(){ 
                        window.opener.location.reload(); 
                        window.close(); 
                    }, 1500);
                </script>
            </body></html>
        `);
    }

    return { onRequest };
});