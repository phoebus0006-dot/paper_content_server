// mqtt-topic.js — Topic construction and validation
function publicationTopic(deviceId) { return 'epaper/' + deviceId + '/publication'; }
function commandTopic(deviceId) { return 'epaper/' + deviceId + '/command'; }
function statusTopic(deviceId) { return 'epaper/' + deviceId + '/status'; }
function availabilityTopic(deviceId) { return 'epaper/' + deviceId + '/availability'; }
function isValidTopic(topic) { return /^epaper\/[a-zA-Z0-9_-]+\/(publication|command|status|availability)$/.test(topic); }
module.exports = { publicationTopic, commandTopic, statusTopic, availabilityTopic, isValidTopic };
