/****************************************
 * Author : Jobin & Jismi IT Services LLP
 * **************************************
 * Description : Print UPS Shipping Label
 * Date : 29/07/2021
 * **************************************/
/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/search','N/https','N/record','N/file','N/url','N/redirect','N/render','N/ui/serverWidget','N/config'], (search,https,record,file,url,redirect,render,serverWidget,config) => {

    const API_HEADER = {
        "Content-type" : "application/json",
        "Accept" : "application/json",
        "Username" : "alliedtradinginc",
        "Password" : "Allied10555",
        "Accesslicensenumber" : "7D724FC3C0E4F732"
    }

    let dataset = {

        isProduction : () =>{
            var companyInfo = config.load({
                type: config.Type.COMPANY_INFORMATION
            });
            var ns_companyid = companyInfo.getValue({
                fieldId: 'companyid'
            }).toString().trim().toLowerCase();

            if (Number.isNaN(Number(ns_companyid)))  //Will be NaN for Sandbox or Release Preview accounts
                return true; // return false when script moved to production
        },

        // Checking the IF is created from Sales Order
        checkOrderType : (createdFromType) => {
            try {
                let so_Search = search.create({
                    type : search.Type.SALES_ORDER,
                    filters : [['mainline','is','T'],'AND',
                        ['cogs','is','F'],'AND',
                        ['taxline','is','F'],'AND',
                        ['shipping','is','F'],'AND',
                        ['internalid','anyof',createdFromType]],
                    columns : ['internalid']
                });
                let so_Search_Count = so_Search.runPaged().count;
                if(so_Search_Count > 0 ){
                    return true;
                }
            }catch (e) {
                log.error("Error @checkOrderType", e.message);
            }
        },

        // Checking the Ship Carrier , Ship Blind , Ship Method are satisfies the given conditions
        checkShipDetailsTrue :  (newRecordId) => {
            try {
                let ship_Carrier,ship_Blind,ship_Method;
                let ship_Details_Search = search.create({
                    type : search.Type.ITEM_FULFILLMENT,
                    filters : [['mainline','is','T'],'AND',
                        ['cogs','is','F'],'AND',
                        ['shipping','is','F'],'AND',
                        ['taxline','is','F'],'AND',
                        ['internalid','anyof',newRecordId]],
                    columns : [
                        search.createColumn({
                            name : 'shipcarrier',
                        }),
                        search.createColumn({
                            name : 'shipmethod',
                        }),
                        search.createColumn({
                            name : 'custbody_apc_ship_blind',
                            join : 'createdFrom',
                            label : 'Ship Blind'
                        })
                    ]
                });

                ship_Details_Search.run().each(function (result){
                    ship_Carrier = result.getValue({
                        name : 'shipcarrier'
                    });
                    ship_Blind = result.getValue({
                        name : 'custbody_apc_ship_blind',
                        join : 'createdFrom',
                        label : 'Ship Blind'
                    });
                    ship_Method = result.getText({
                        name : 'shipmethod'
                    });
                });

                if(ship_Blind == true && ship_Carrier == 'nonups' && ( ship_Method == 'UPS 2nd Day Air (Blind)' || ship_Method == 'UPS 2nd Day Air A.M.(Blind)' || ship_Method == 'UPS GROUND (BLIND)' || ship_Method == 'UPS Next Day Air (Blind)')){
                    return true;
                }
            }catch (e) {
                log.error('Error @getShipDetailsTrue', e.message);
            }
        },

        // Fetching the response from UPS Shipping API
        getApiResponse :  (scriptContext) => {
            try {
                let customerRecord = record.load({
                    type : record.Type.CUSTOMER,
                    id : scriptContext.newRecord.getValue({fieldId : 'entity'})
                });

                // Set Shipping Method value to the corresponding serivce code of the Shipping Method
                let service_Code;
                let shipping_Method = scriptContext.newRecord.getText({fieldId:'shipmethod'});
                if(shipping_Method == "UPS 2nd Day Air (Blind)") {service_Code = "02"}
                if(shipping_Method == "UPS 2nd Day Air A.M.(Blind)"){service_Code = "59"}
                if(shipping_Method == "UPS GROUND (BLIND)"){service_Code = "03"}
                if(shipping_Method == "UPS Next Day Air (Blind)"){service_Code = "01"}

                let company_Name = customerRecord.getValue({fieldId:'companyname'});


                // Getting the Customer Shipping Address Details
                let shipping_City,shipping_Zip,shipping_Country,shipping_State,shipping_Address;
                let address_book_count = customerRecord.getLineCount({sublistId:'addressbook'});
                for (let i = 0 ; i < address_book_count ; i++){
                    let default_Shipping = customerRecord.getSublistValue({line : i,sublistId:'addressbook',fieldId:'defaultshipping'});
                    if(default_Shipping === true){
                        shipping_City = customerRecord.getSublistValue({line:i,sublistId:'addressbook',fieldId:'city_initialvalue'});
                        shipping_Zip =  customerRecord.getSublistValue({line:i,sublistId:'addressbook',fieldId:'zip_initialvalue'});
                        shipping_Country = customerRecord.getSublistValue({line:i,sublistId:'addressbook',fieldId:'country_initialvalue'});
                        shipping_State =  customerRecord.getSublistValue({line:i,sublistId:'addressbook',fieldId:'state_initialvalue'});
                        shipping_Address = customerRecord.getSublistValue({line:i,sublistId:'addressbook',fieldId:'addr1_initialvalue'});
                    }
                }

                // Getting the Customer Shipping Address from item fulfilment record
                let fulfil_Id = scriptContext.newRecord.id;
                log.debug("fulfil Id", fulfil_Id);
                var itemfulfillmentSearchObj = search.create({
                    type: "itemfulfillment",
                    filters:
                        [
                            ["type","anyof","ItemShip"],
                            "AND",
                            ["internalid","anyof",fulfil_Id],
                            "AND",
                            ["cogs","is","F"],
                            "AND",
                            ["mainline","is","T"],
                            "AND",
                            ["taxline","is","F"],
                            "AND",
                            ["shipping","is","F"]
                        ],
                    columns:
                        [
                            search.createColumn({name: "shipaddressee", label: "Shipping Addressee"}),
                            search.createColumn({name: "shipstate", label: "Shipping State/Province"}),
                            search.createColumn({name: "shipcountry", label: "Shipping Country"}),
                            search.createColumn({name: "shipzip", label: "Shipping Zip"}),
                            search.createColumn({name: "shipcity", label: "Shipping City"}),
                            search.createColumn({name: "shipaddress1", label: "Shipping Address 1"}),
                            search.createColumn({name: "shipaddress2", label: "Shipping Address 2"})
                        ]
                });
                var searchResultCount = itemfulfillmentSearchObj.runPaged().count;
                let ship_To_City,ship_To_Zip,ship_To_Country,ship_To_State,ship_To_Address1,ship_To_Address2,ship_To_Company;
                itemfulfillmentSearchObj.run().each(function(result){
                    ship_To_City = result.getValue({name: "shipcity", label: "Shipping City"});
                    ship_To_Zip = result.getValue({name: "shipzip", label: "Shipping Zip"});
                    ship_To_Country = result.getValue({name: "shipcountry", label: "Shipping Country"});
                    ship_To_State = result.getValue({name: "shipstate", label: "Shipping State/Province"});
                    ship_To_Address1 = result.getValue({name: "shipaddress1", label: "Shipping Address 1"});
                    ship_To_Address2 = result.getValue({name: "shipaddress2", label: "Shipping Address 2"});
                    ship_To_Company = result.getValue({name: "shipaddressee", label: "Shipping Addressee"})
                    return true;
                });

                if(company_Name.length > 35){
                    company_Name = company_Name.substr(0,35);
                }
                if(ship_To_Company.length > 35){
                    ship_To_Company = ship_To_Company.substr(0,35);
                }


                // Getting Package Weight from UPS Tracking Number
                let weight = scriptContext.newRecord.getSublistValue({
                    line : 0,
                    sublistId : 'package',
                    fieldId : 'packageweight'
                });
                let package_Weight = weight.toString()


                // API Call for getting the response from the UPS Shipping
                let shipping_Api = https.post({
                    url : 'https://onlinetools.ups.com/ship/v1/shipments',
                    headers : API_HEADER,
                    body : JSON.stringify({
                        "ShipmentRequest": {
                            "Shipment": {
                                "Shipper": {
                                    "Name": company_Name,
                                    "ShipperNumber": "W897F7",
                                    "Address": {
                                        "AddressLine": shipping_Address,
                                        "City": shipping_City,
                                        "StateProvinceCode": shipping_State,
                                        "PostalCode": shipping_Zip,
                                        "CountryCode": shipping_Country
                                    }
                                },
                                "ShipTo": {
                                    "Name": ship_To_Company,
                                    "Address": {
                                        "AddressLine": [ship_To_Address1,ship_To_Address2],
                                        "City": ship_To_City,
                                        "StateProvinceCode": ship_To_State,
                                        "PostalCode": ship_To_Zip,
                                        "CountryCode": ship_To_Country
                                    }
                                },
                                "ShipFrom": {
                                    "Name": "Allied Power and Control",
                                    "AttentionName": "Allied Power and Control",
                                    "Phone": {
                                        "Number": "(866) 335-5204"
                                    },
                                    "Address": {
                                        "AddressLine": "7235 Standard Drive",
                                        "City": "Hanover",
                                        "StateProvinceCode": "MD",
                                        "PostalCode": "21076",
                                        "CountryCode": "US"
                                    }
                                },
                                "PaymentInformation":
                                    {
                                        "ShipmentCharge": {
                                            "Type": "01",
                                            "BillShipper": {
                                                "AccountNumber": "W897F7"
                                            }
                                        }
                                    },
                                "Service":
                                    {
                                        "Code": service_Code,
                                        "Description": ""
                                    },
                                "Package": [{
                                    "Description": "International Goods",
                                    "Packaging": {
                                        "Code": "02"
                                    },
                                    "PackageWeight": {
                                        "UnitOfMeasurement": {
                                            "Code": "LBS"
                                        },
                                        "Weight": package_Weight
                                    },
                                }
                                ],
                            },
                            "LabelSpecification": {
                                "LabelImageFormat": {
                                    "Code": "GIF"
                                },
                                "LabelStockSize": {
                                    "Height": "6",
                                    "Width": "4"
                                }
                            }
                        }
                    })
                });
                let fulfil_Record = record.load({
                    type : record.Type.ITEM_FULFILLMENT,
                    id :fulfil_Id
                });
                log.debug('Response Body', shipping_Api.body);
                let parsed_Shipping_Api = JSON.parse(shipping_Api.body);
                if(shipping_Api.code === 200){
                    fulfil_Record.setValue({fieldId : 'custbody_jj_ups_shipping_label_error',value : ""});
                    fulfil_Record.save();
                    return parsed_Shipping_Api;
                }
                else {
                    let error_message = parsed_Shipping_Api.response.errors[0].message;
                    log.debug("Error Message",error_message);
                    if(error_message){
                        fulfil_Record.setValue({fieldId : 'custbody_jj_ups_shipping_label_error',value : error_message});
                        fulfil_Record.save();
                    }
                }
            }catch (e){
                log.error("Error @getApiResponse", e.message);
            }
        },

        // Saving the PDF file to File Cabinet with name as IF number
        saveFile : (base64decode,fulfilId) => {
            try {
                let html_Tag = '<?xml version="1.0"?><!DOCTYPE pdf PUBLIC "-//big.faceless.org//report" "report-1.1.dtd">\n' +
                    '<pdf>\n' +
                    '<head>\n' +
                    '</head>\n' +
                    '<body padding=".01in" width="605px" height="405px">\n' +
                    '    <img src="data:image/gif;base64,'+base64decode+'" style=" width:600px; height:400px; margin-left:20px;"/>\n' +
                    '</body>\n' +
                    '</pdf>';
                var myTemFile=render.create();
                myTemFile.templateContent = html_Tag;
                var pdfFile = myTemFile.renderAsPdf();

                pdfFile.name = fulfilId+".pdf";
                pdfFile.folder =579022;
                let id = pdfFile.save();
                return id;
            }catch (e) {
                log.error("Error @saveFile", e.message);
            }
        }
    }

    /************ After Submit ***************/
    const afterSubmit = (scriptContext) => {
        try {
            if (dataset.isProduction()) { return; }
            if(scriptContext.type == 'delete'){
                return;
            }
            let new_Record_Id = scriptContext.newRecord.id;
            let new_Ship_Status = scriptContext.newRecord.getValue('shipstatus');
            let created_From_Type = scriptContext.newRecord.getValue('createdfrom');
            let fulfil_Record = record.load({
                type : record.Type.ITEM_FULFILLMENT,
                id : new_Record_Id,
            });
            let fulfil_Tran_Id = fulfil_Record.getValue({fieldId : 'tranid'});

            if (dataset.checkOrderType(created_From_Type)) {
                let ups_label = scriptContext.newRecord.getValue({
                    fieldId : "custbody_jj_ups_blind_shipping_label",
                });

                // Checks whether the ups label is already created or not and also check the status is packed
                if ( ups_label==false && new_Ship_Status == 'B') {

                    // Checks whether the shipping details are true
                    if (dataset.checkShipDetailsTrue(new_Record_Id)) {
                        let shipping_Api_Response = dataset.getApiResponse(scriptContext);
                        let shipping_Api_Response_label = shipping_Api_Response.ShipmentResponse.ShipmentResults.PackageResults.ShippingLabel.GraphicImage;
                        let file_ID = dataset.saveFile(shipping_Api_Response_label, fulfil_Tran_Id);

                        let tracking_Number = shipping_Api_Response.ShipmentResponse.ShipmentResults.PackageResults.TrackingNumber;
                        log.debug("Tracking Number",tracking_Number);

                        let fulfilRecord = record.load({
                            type : record.Type.ITEM_FULFILLMENT,
                            id : new_Record_Id
                        });
                        fulfilRecord.setValue({
                            fieldId : 'custbody_jj_ups_blind_shipping_label',
                            value : true
                        });
                        fulfilRecord.setValue({
                            fieldId : 'custbody_jj_ups_blind_ship_label_id',
                            value : file_ID
                        });
                        fulfilRecord.setSublistValue({
                            line : 0,
                            sublistId : 'package',
                            fieldId : 'packagetrackingnumber',
                            value : tracking_Number
                        });
                        fulfilRecord.save({ignoreMandatoryFields : true,enableSourcing : true});
                    }
                }
            }
        } catch (err) {
            log.error("Error @afterSubmit", err);
        }

    }


    /************ Before Load ***************/
    const beforeLoad = (scriptContext) =>{
        try {
            if (dataset.isProduction()) { return; }
            let formVal = scriptContext.form;
            let id = scriptContext.newRecord.getValue({
                fieldId : "custbody_jj_ups_blind_ship_label_id",
            });
            let output = url.resolveScript({
                scriptId: 'customscript_jj_sl_ups_label_apc_314',
                deploymentId: 'customdeploy_jj_sl_ups_label_apc_314',
                params : {
                    value : id
                }
            });
            if(id){
                var htmlImage = formVal.addField({
                    id: 'custpage_htmlfield',
                    type: serverWidget.FieldType.INLINEHTML,
                    label: 'HTML Image'
                });
                htmlImage.defaultValue = '"<html><body><script>window.open("'+output+'");</script></body>></html>"';
                let unset_Id = record.submitFields({
                    type: record.Type.ITEM_FULFILLMENT,
                    id: scriptContext.newRecord.id,
                    values: {
                        custbody_jj_ups_blind_ship_label_id	: ""
                    }
                });
            }
        }catch (err){
            log.error("Error @Before Load", err.message);
        }
    }
    return{afterSubmit,beforeLoad}
});