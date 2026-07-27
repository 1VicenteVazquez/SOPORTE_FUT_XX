/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 *
 * fut_cs_carga_nc_masiva.js
 * Client Script — Interfaz de Carga Masiva de Notas de Crédito
 */
define(['N/ui/dialog'], (dialog) => {
    
    let archivosProcesados = [];

    // Esta función lee el archivo local de la PC y lo convierte a Base64
    const leerArchivoBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
            reader.readAsDataURL(file);
        });
    };

    // pageInit se ejecuta en cuanto carga la pantalla del Suitelet
    const pageInit = (context) => {
        const fileInput = document.getElementById('xml_files');
        
        if (fileInput) {
            // Escuchamos cada vez que el usuario selecciona archivos
            fileInput.addEventListener('change', async (event) => {
                archivosProcesados = []; // Limpiamos si vuelve a seleccionar
                const files = event.target.files;
                
                if (!files || files.length === 0) return;

                document.body.style.cursor = 'wait'; // Cambiamos cursor a "cargando"

                try {
                    for (let i = 0; i < files.length; i++) {
                        const file = files[i];
                        const base64 = await leerArchivoBase64(file);
                        
                        archivosProcesados.push({
                            nombre: file.name,
                            // Separamos la cabecera del DataURL para quedarnos solo con el Base64 puro
                            contenido: base64.split(',')[1] 
                        });
                    }
                } catch (e) {
                    dialog.alert({ title: 'Error', message: 'Hubo un error al leer los archivos XML.' });
                } finally {
                    document.body.style.cursor = 'default';
                }
            });
        }
    };

    // saveRecord se ejecuta justo cuando le das clic al botón de "Enviar a Procesar"
    const saveRecord = (context) => {
        const fileInput = document.getElementById('xml_files');
        
        // Validación 1: Que haya seleccionado al menos un archivo
        if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
            dialog.alert({ title: 'Atención', message: 'Por favor, selecciona al menos un archivo XML antes de procesar.' });
            return false;
        }

        // Validación 2: Que el navegador ya haya terminado de leer los archivos
        if (archivosProcesados.length !== fileInput.files.length) {
             dialog.alert({ title: 'Procesando...', message: 'Los archivos aún se están cargando en memoria. Por favor, intenta de nuevo en unos segundos.' });
             return false;
        }

        // Si todo está bien, inyectamos el JSON de los archivos en el campo oculto de NetSuite
        context.currentRecord.setValue({
            fieldId: 'custpage_files_data',
            value: JSON.stringify(archivosProcesados)
        });

        return true; // Permitimos que el formulario viaje al servidor (Suitelet)
    };

    return { pageInit, saveRecord };
});