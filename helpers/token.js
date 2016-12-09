'use strict';

var request = require('request');

exports = module.exports = refreshMicrosoftToken;

function refreshMicrosoftToken (refreshToken, callback) {
    var data = 'grant_type=refresh_token' 
        + '&refresh_token=' + refreshToken
        + '&client_id=' + process.env.MICROSOFT_CLIENT_ID
        + '&client_secret=' + encodeURIComponent(process.env.MICROSOFT_CLIENT_SECRET) 
        + '&resource=' + encodeURIComponent(process.env.MICROSOFT_RESOURCE_CRM);

    var opts = {
        url: 'https://login.microsoftonline.com/common/oauth2/token',
        body: data,
        json: true,
        headers : { 'Content-Type' : 'application/x-www-form-urlencoded' }
    };

    request.post(opts, function (err, res, body) {
        if (err) return callback(err, body, res);
        if (parseInt(res.statusCode / 100, 10) !== 2) {
            if (body.error) {
                return callback(new Error(res.statusCode + ': ' + (body.error.message || body.error)), body, res);
            }
            if (!body.access_token) {
                return callback(new Error(res.statusCode + ': refreshToken error'), body, res);
            }
            return callback(null, body, res);
        }
        callback(null, {
            accessToken: body.access_token,
            refreshToken: body.refresh_token
        }, res);
    }); 
}