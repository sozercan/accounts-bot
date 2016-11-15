var builder = require('botbuilder');
var request = require('request');
var platforms = require("./platforms.js");

module.exports = {
    Label: 'Account information',
    Dialog: [        
        function (session) {
            builder.Prompts.text(session, "Let's start with getting the account name. What is the account name?");
        },
        function (session, results, next) {
            if (results.response) {
                session.send('Gotcha! Looking for account %s... :mag_right:', results.response);

                request({
                    url: process.env.MICROSOFT_RESOURCE_CRM + "/api/data/v8.1/accounts?$select=accountid,name,description&$filter=contains(name,'"+results.response+"')", 
                    headers: {
                        'Authorization': session.userData.accessTokenCRM,
                    }
                }, function(error, response, body){
                    if(!error) {
                        var data = JSON.parse(body);

                        session.send('I found total of %d accounts:', data.value.length);

                        var message = new builder.Message()
                            .attachmentLayout(builder.AttachmentLayout.carousel)
                            .attachments(data.value.map(cardsAsAttachment));

                        session.send(message);
                        
                        function cardsAsAttachment(account) {
                            return new builder.HeroCard()
                                .images([new builder.CardImage().url("https://logo.clearbit.com/" + account.name + ".com")])
                                .title(account.name)
                                .text(account.description)
                                .buttons([
                                    new builder.CardAction()
                                        .title('Select account')
                                        .type('imBack')
                                        .value(account.accountid),
                                    new builder.CardAction()
                                        .title('View in DXCRM')
                                        .type('openUrl')
                                        .value(process.env.MICROSOFT_RESOURCE_CRM + "/main.aspx?etc=1&id="+account.accountid+"&pagetype=entityrecord#908391997"),
                                ]);
                        }
                        next();
                    }
                    else {
                        session.send("Something happened");
                        console.log(error);
                    }
                });
            }
        },

        function(session) {
            builder.Prompts.text(session, "Please select an account");
        },
        function(session, results, next) {
            if (results.response) {
                session.dialogData.accountid = results.response;
                
                request({
                    url: process.env.MICROSOFT_RESOURCE_CRM + "/api/data/v8.1/accounts?$select=accountid,taps_mssalestpid,address1_city,address1_stateorprovince,taps_district,description,statecode,_taps_accountownerid_value&$filter=accountid%20eq%20" + results.response, 
                    headers: {
                        'Authorization': session.userData.accessTokenCRM,
                    }
                }, function(error, response, body){
                    session.dialogData.accountData = body;             
                    next();
                });            
            }
        },

        function(session) {
            builder.Prompts.choice(session, "What would you like to do?", ['Account Information','Opportunities']);
        },
        function(session, results) {
            switch (results.response.index) {
                case 0:
                    var data = session.dialogData.accountData;
                    var accountData = JSON.parse(data);

                    request({
                        url: process.env.MICROSOFT_RESOURCE_CRM + "/api/data/v8.1/systemusers?$select=fullname&$filter=systemuserid%20eq%20" +  accountData.value[0]._taps_accountownerid_value, 
                        headers: {
                            'Authorization': session.userData.accessTokenCRM,
                        }
                    }, function(error, response, body){
                        if(!error) {
                            session.dialogData.ownerData = JSON.parse(body);
                            session.send("Here's the account information...");
                            session.send("Account Owner: %s  \nTPID: %s  \nLocation: %s  \nDistrict: %s  \nDescription: %s  \nStatus: %s", 
                            session.dialogData.ownerData.value[0].fullname, 
                            accountData.value[0].taps_mssalestpid, 
                            accountData.value[0].address1_city + ", " + accountData.value[0].address1_stateorprovince,
                            accountData.value[0].taps_district, 
                            accountData.value[0].description, 
                            accountData.value[0].statecode);
                        }
                    });
                    session.endDialog();
                    break;
                case 1:
                default:
                    var platforms = Object.getOwnPropertyNames(platforms.technology);
                    builder.Prompts.choice(session, "Which type of opportunities are you interested in?", platforms);
                    break;
            }
        },
        function(session, results, next) {            
            request({
                url: process.env.MICROSOFT_RESOURCE_CRM + "/api/data/v8.1/taps_appopportunities?$select=taps_name,taps_description,taps_appopportunityid&$filter=_taps_account_value%20eq%20" + session.dialogData.accountid, 
                headers: {
                    'Authorization': session.userData.accessTokenCRM,
                }
            }, function(error, response, body){
                if(!error) {
                    session.dialogData.oppData = body;
                    var data = JSON.parse(body);
                    
                    session.send('I found total of %d opportunities:', data.value.length);

                    var message = new builder.Message()
                        .attachmentLayout(builder.AttachmentLayout.carousel)
                        .attachments(data.value.map(cardsAsAttachment));

                    session.send(message);

                    function cardsAsAttachment(opp) {
                        return new builder.HeroCard()
                            .title(opp.taps_name)
                            .text(opp.taps_description)
                            .buttons([
                                new builder.CardAction()
                                    .title('Select opportunity')
                                    .type('imBack')
                                    .value(opp.taps_appopportunityid),
                                new builder.CardAction()
                                    .title('View in AppTracker')
                                    .type('openUrl')
                                    .value("http://apptracker/Home/Account/" + opp.taps_appopportunityid)
                            ]);
                    }
                }
                next();
            });
        },

        function(session){
            builder.Prompts.text(session, "Please select an opportunity");
        },
        function(session, results, next) {

            var oppData = JSON.parse(session.dialogData.oppData);
            var opp;

            for(o in oppData.value){
                if(results.response == oppData.value[o].taps_appopportunityid){
                    opp = oppData.value[o];
                    break;
                }
            }

            if (results.response) {
                session.send("Here's the opportunity information...");
                session.send("Name: %s  \nStage: %s", 
                opp.taps_name, 
                opp.taps_appopportunityid);
            }
        }
    ]
}