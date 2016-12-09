'use strict';

var builder = require('botbuilder');
var request = require('request');
var emoji = require('node-emoji');

module.exports = {
    Label: 'Find accounts',
    Dialog: [
        function (session) {
            builder.Prompts.text(session, "Let's start with getting the location. Type a state code (for example, \"CA\") or \"skip\"...");
        },
        function (session, results, next) {
            if (results.response) {
                
                if(results.response != 'skip') {
                    session.send("Gotcha! Looking for accounts in %s... "  + emoji.get('mag_right'), results.response);
                    session.userData.location = results.response;
                }
                else {
                    session.send("Alright, skipping location filter");
                    session.userData.location = null;
                }
                next();
            }
        },

        function(session) {
            var audience = ['Commercial', 'Consumer', 'Other'];

            var a = { actions: [] };
            for (var i = 0; i < audience.length; i++) {
                var action = audience[i];
                a.actions.push({ title: action, message: action });
            }

            var msg = new builder.Message()
                .text("Which primary audience would you like to filter with?")
                .addAttachment(a);

            builder.Prompts.choice(session, msg, audience);
        },
        function (session, results, next) {
            if (results.response) {

                session.userData.audience = [];
                session.userData.audience[0] = results.response.entity;

                switch(results.response.entity) {
                    case "Commercial":
                        session.userData.audience[1] = "445560000";
                        break;
                    case "Consumer":
                        session.userData.audience[1] = "445560001";
                        break;
                    case "Other":
                    default:
                        session.userData.audience = null;
                        break;
                }

                session.send("Thanks! I'll look for " + results.response.entity + " accounts");
            }
            next();
        },

        function(session) {
            var districts = ['SMSP', 'EPG', 'Other'];

            var a = { actions: [] };
            for (var i = 0; i < districts.length; i++) {
                var action = districts[i];
                a.actions.push({ title: action, message: action });
            }

            var msg = new builder.Message()
                .text("Which district would you like to filter with?")
                .addAttachment(a);

            builder.Prompts.choice(session, msg, districts);
        },
        function (session, results, next) {
            if (results.response) {
                session.send("Thanks! Looking for " + results.response.entity + " accounts");

                if(results.response.entity !== "Other") {
                    session.userData.district = results.response.entity;
                }
                else {
                    session.userData.district = null;
                }
            }
            next();
        },
        function(session, results, next) {
            var url = process.env.MICROSOFT_RESOURCE_CRM + "/api/data/v8.1/accounts?$filter=statecode%20eq%200%20and";

            if(session.userData.location) {
                var location = "%20startswith(address1_stateorprovince,%20'" + session.userData.location + "')";
                url += location + "%20and%20";
            }

            if(session.userData.audience) {
                var audience = "%20taps_primaryaudience%20eq%20" + session.userData.audience[1];
                url += audience + "%20and%20";
            }
            
            if(session.userData.district) {
                var district = "%20startswith(taps_district,'" + session.userData.district + "')";
                url += district;
            }

            request({
                url: url,
                headers: {
                    'Authorization': session.userData.accessTokenCRM,
                }
            }, function(error, response, body){
                if(!error) {
                    if(response.statusCode != 200) {
                        session.send("Something happened " + emoji.get('thunder_cloud_and_rain'));
                        session.endDialog();
                    }
                    else {
                        var data = JSON.parse(body);

                        if(data.value.length > 0) {
                            session.send('I found total of %d accounts' + emoji.get('sparkles'), data.value.length);

                            var message = new builder.Message()
                                .attachmentLayout(builder.AttachmentLayout.carousel)
                                .attachments(data.value.map(cardsAsAttachment));

                            session.send(message);
                            session.replaceDialog('/backToMenu', { source: 'find' });
                        }
                        else {
                            session.send("No accounts found with these filters");
                            session.replaceDialog('/backToMenu', { source: 'find' });
                        }

                        function cardsAsAttachment(account) {
                            var cardImageUrl;
                            if(account.websiteurl) {
                                cardImageUrl = "http://image.thum.io/get/" + account.websiteurl;
                            } else {
                                cardImageUrl = "https://logo.clearbit.com/" + account.name + ".com";
                            }

                            return new builder.HeroCard()
                                .images([new builder.CardImage().url(cardImageUrl)])
                                .title(account.name)
                                .text(account.description)
                                .buttons([
                                    new builder.CardAction()
                                        .title('View in DXCRM')
                                        .type('openUrl')
                                        .value(process.env.MICROSOFT_RESOURCE_CRM + "/main.aspx?etc=1&id="+account.accountid+"&pagetype=entityrecord#908391997"),
                                ]);
                        }
                    }
                }
                else {
                    session.send("Something happened " + emoji.get('thunder_cloud_and_rain'));
                    console.log(error);
                }
            });
        }
    ]
};