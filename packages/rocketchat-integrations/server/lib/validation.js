/* global Babel */
const scopedChannels = ['all_public_channels', 'all_private_groups', 'all_direct_messages'];
const validChannelChars = ['@', '#'];

RocketChat.integrations.validateOutgoing = function _validateOutgoing(integration, userId) {
	if (integration.channel && Match.test(integration.channel, String) && integration.channel.trim() === '') {
		delete integration.channel;
	}

	if (!integration.username || !Match.test(integration.username, String) || integration.username.trim() === '') {
		throw new Meteor.Error('error-invalid-username', 'Invalid username', { method: 'addOutgoingIntegration' });
	}

	if (!Match.test(integration.urls, [String])) {
		throw new Meteor.Error('error-invalid-urls', 'Invalid URLs', { method: 'addOutgoingIntegration' });
	}

	for (const [index, url] of integration.urls.entries()) {
		if (url.trim() === '') {
			delete integration.urls[index];
		}
	}

	integration.urls = _.without(integration.urls, [undefined]);

	if (integration.urls.length === 0) {
		throw new Meteor.Error('error-invalid-urls', 'Invalid URLs', { method: 'addOutgoingIntegration' });
	}

	if (!Match.test(integration.channel, String)) {
		throw new Meteor.Error('error-invalid-channel', 'Invalid Channel', { method: 'addOutgoingIntegration' });
	}

	const channels = _.map(integration.channel.split(','), (channel) => s.trim(channel));

	for (const channel of channels) {
		if (!validChannelChars.includes(channel[0]) && !scopedChannels.includes(channel.toLowerCase())) {
			throw new Meteor.Error('error-invalid-channel-start-with-chars', 'Invalid channel. Start with @ or #', { method: 'updateIncomingIntegration' });
		}
	}

	if (integration.triggerWords) {
		if (!Match.test(integration.triggerWords, [String])) {
			throw new Meteor.Error('error-invalid-triggerWords', 'Invalid triggerWords', { method: 'addOutgoingIntegration' });
		}

		for (const [index, triggerWord] of integration.triggerWords) {
			if (triggerWord.trim() === '') {
				delete integration.triggerWords[index];
			}
		}

		integration.triggerWords = _.without(integration.triggerWords, [undefined]);
	}

	if (integration.scriptEnabled === true && integration.script && integration.script.trim() !== '') {
		try {
			const babelOptions = Object.assign(Babel.getDefaultOptions({ runtime: false }), { compact: true, minified: true, comments: false });

			integration.scriptCompiled = Babel.compile(integration.script, babelOptions).code;
			integration.scriptError = undefined;
		} catch (e) {
			integration.scriptCompiled = undefined;
			integration.scriptError = _.pick(e, 'name', 'message', 'stack');
		}
	}

	for (let channel of channels) {
		if (scopedChannels.includes(channel)) {
			if (channel === 'all_public_channels') {
				// No special permissions needed to add integration to public channels
			} else if (!RocketChat.authz.hasPermission(userId, 'manage-integrations')) {
				throw new Meteor.Error('error-invalid-channel', 'Invalid Channel', { method: 'addOutgoingIntegration' });
			}
		} else {
			let record;
			const channelType = channel[0];
			channel = channel.substr(1);

			switch (channelType) {
				case '#':
					record = RocketChat.models.Rooms.findOne({
						$or: [
							{_id: channel},
							{name: channel}
						]
					});
					break;
				case '@':
					record = RocketChat.models.Users.findOne({
						$or: [
							{_id: channel},
							{username: channel}
						]
					});
					break;
			}

			if (!record) {
				throw new Meteor.Error('error-invalid-room', 'Invalid room', { method: 'addOutgoingIntegration' });
			}

			if (record.usernames && !RocketChat.authz.hasPermission(userId, 'manage-integrations') && RocketChat.authz.hasPermission(userId, 'manage-own-integrations') && !record.usernames.includes(Meteor.user().username)) {
				throw new Meteor.Error('error-invalid-channel', 'Invalid Channel', { method: 'addOutgoingIntegration' });
			}
		}
	}

	const user = RocketChat.models.Users.findOne({ username: integration.username });

	if (!user) {
		throw new Meteor.Error('error-invalid-user', 'Invalid user', { method: 'addOutgoingIntegration' });
	}

	integration.type = 'webhook-outgoing';
	integration.userId = user._id;
	integration.channel = channels;

	return integration;
};