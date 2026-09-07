/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * 
 * CS_Fut_ItemReceipt_StatusCalculo.js
 */
define(['N/currentRecord', 'N/ui/message'], (currentRecord, message) => {

    function pageInit(context) {
        // Solo actuamos en modo vista
        if (context.mode !== 'view') return;

        const rec = currentRecord.get();
        const estado = rec.getValue({ fieldId: 'custbody_fut_status_calculo' });

        // Si ya terminó (EXITO / ERROR) o está vacío, no mostramos ningún recuadro flotante. 
        // El usuario lo leerá directamente en el campo del formulario o en su correo.
        if (estado === 'PROCESANDO') {
            message.create({
                title: 'Cálculo en proceso',
                message: 'Los costos se están calculando en segundo plano. Recibirás un correo cuando termine, o puedes recargar esta página más tarde.',
                type: message.Type.INFORMATION
            }).show();
        } 
    }

    return { pageInit };
});