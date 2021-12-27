/****************************************
 * Author : Jobin & Jismi IT Services LLP
 * **************************************
 * Description : Suitelet for Print UPS Shipping Label
 * Date : 29/07/2021
 * **************************************/
/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/render','N/file'],

    (render,file) => {
        const onRequest = (scriptContext) => {
            try {
                let id = scriptContext.request.parameters.value;
                scriptContext.response.writeFile(file.load({id:id}));
            }catch (e){
                log.debug('error @ onRequest', e.message);
            }
        }
        return {onRequest}
    });
