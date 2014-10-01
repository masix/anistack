var db = require('../../models/db.js');
var hAuth = require('../../helpers/auth.js');
var listValidate = require('../../helpers/validateListData.js');
var User = db.User;
var Anime = db.Anime;
var _ = require('lodash');

module.exports = function(app){
	var listType, Collection;

	// ?: Sets the list type

	app.route('/list/:list(anime|manga)*')
	.all(function(req, res, next){
		listType = req.param('list');
		Collection = (listType === 'anime') ? Anime : ''; // Change to manga later
		next();
	});

	// ?: Get user's list

	app.route('/list/:list(anime|manga)/view/:username')
	.get(function(req, res, next){
		// Needs cleanup
		User.findOne({
			username: req.param('username').toLowerCase()
		}, {
			email: 0,
			password: 0,
			API_key: 0
		}, function(err, listDoc){
			if(err) return next(new Error(err));
			if(!listDoc) return next(new Error('User not found'));

			listDoc = listDoc.toObject()[req.param('list') + '_list'];
			var seriesIds = _.map(listDoc, function(listItem){
				return listItem._id
			});

			Anime.find({
				_id: {
					$in: seriesIds
				}
			}, function(err, seriesDocs){
				seriesDocs = seriesDocs.map(function(seriesItem){
					return seriesItem.toObject();
				});
				var joinedList = _.map(listDoc, function(listItem){
					return _.extend(listItem, _.findWhere(seriesDocs, function(seriesItem){
						return seriesItem._id.equals(listItem._id)
					}));
				});
				return res.status(200).json(joinedList);
			});
		});
	});

	app.route('/list/:list(anime|manga)/add')
	.all(hAuth.ifAuth)
	.post(function(req, res, next){
		if(!req.body._id){
			return next(new Error('No _id was sent'));
		}

		if(
			_.map(req.user.anime_list, function(list){ return list._id.toString() })
			.indexOf(req.body._id) > -1
		){
			return next(new Error('_id already exists in list'));
		}

		var listItem = {
			_id: req.body._id,
			item_progress: req.body.itemProgress,
			item_rating: req.body.itemRating,
			item_status: req.body.itemStatus || 'current',
			item_repeats: req.body.itemRepeats
		}

		listValidate.validate.anime(listItem, function(err, itemDoc){
			if(!err){
				User.update({
					_id: req.user._id
				}, {
					$addToSet: {
						anime_list: itemDoc
					}
				}, function(err, status){
					if(status){
						res.status(200).json({ status: 'ok', message: 'added item to list' });
					} else {
						next(new Error('could not add item to list'));
					}
				});
			}
		});
	});

	app.route('/list/:list(anime|manga)/update')
	.all(hAuth.ifAuth)
	.post(function(req, res, next){
		if(!req.body._id){
			return next(new Error('no _id was sent'));
		}

		var listItem = {
			_id: req.body._id,
			item_progress: req.body.itemProgress,
			item_rating: req.body.itemRating,
			item_status: req.body.itemStatus || 'current',
			item_repeats: req.body.itemRepeats
		}
		listValidate.validate.anime(listItem, function(err, itemDoc){
			if(!err){
				var itemData = {};
				itemData['anime_list.$.item_status'] = itemDoc.item_status;				
				if(itemDoc.item_progress !== undefined){
					itemData['anime_list.$.item_progress'] = itemDoc.item_progress;
				}
				if(itemDoc.item_rating !== undefined){
					itemData['anime_list.$.item_rating'] = itemDoc.item_rating;
				}

				User.update({
					_id: req.user._id,
					'anime_list._id': itemDoc._id
				}, {
					$set: itemData
				}, function(err, status){
					if(status){
						res.status(200).json({ status: 'ok', message: 'updated item in list'});
					} else {
						next(new Error('could not update item in list'));
					}
				});
			}
		})
	});

	app.route('/list/:list(anime|manga)/remove')
	.all(hAuth.ifAuth)
	.post(function(req, res, next){
		if(!req.body._id){
			return next(new Error('no _id was sent'));
		}

		var removeListItem = (listType === 'anime') ? { anime_list: { _id: req.body._id } } : { manga_list: { _id: req.body._id } };

		User.update({
			_id: req.user._id
		}, {
			$pull: removeListItem
		}, function(err, status){
			if(status){
				res.status(200).json({
					status: 'ok',
					message: 'removed item from list'
				});
			} else {
				next(new Error('could not remove item from list'));
			}
		})
	});



	app.route('/list/reset')
	.all(hAuth.ifAuth)
	.get(function(req, res, next){
		User.update({
			_id: req.user._id
		}, {
			$set: {
				anime_list: [],
				manga_list: []
			}
		}, function(err, status){
			console.log(err);
			console.log(status);
			res.status(200).end();
		});
	});

	/*
	// ?: Add anime/manga to user's list

	app.route('/list/:list(anime|manga)/add/:username')
	.post(function(req, res, next){
		if(!req.body._id) return next(new Error('No _id was sent'));

		var ListItem = {
			_id: req.body._id,
			item_progress: req.body.progress || 0,
			item_rating: req.body.rating || 0,
			item_status: req.body.status || 'current'
		}

		var addListItem = (listType === 'anime') ? { anime_list: ListItem } : { manga_list: ListItem };

		User.updateOne({
			$or: [
				{ _id: req.param('username') },
				{ username: req.param('username') }
			]
		}, {
			$addToSet: addListItem
		}, function(err, status){
			if(err) return next(new Error(err));
			return res.status(200).json({ status: 'ok', message: 'Added list entry' });
		});
	});

	// ?: Update anime/manga in user's list

	app.route('/list/:list(anime|manga)/update/:username')
	.post(function(req, res, next){
		if(!req.body._id) return next(new Error('No _id was sent'));

		var ListItem = {};
		if(req.body.progress) ListItem[listType + '_list.$.progress'] = req.body.progress;
		if(req.body.rating) ListItem[listType + '_list.$.rating'] = req.body.rating;
		if(req.body.status) ListItem[listType + '_list.$.status'] = req.body.status;

		var updateConditions = {};

		updateConditions['$or'] = [ { _id: req.param('username') }, { username: req.param('username') } ];

		if(listType === 'anime'){
			updateConditions['anime_list._id'] = req.body._id;
		} else {
			updateConditions['manga_list._id'] = req.body._id;
		}

		User.updateOne(updateConditions,{ $set: ListItem }, function(err, status){
			if(err) return next(new Error(err));
			return res.status(200).json({ status: 'ok', message: 'Updated list entry' });
		});
	});

	// ?: Remove anime/manga from user's list

	app.route('/list/:list(anime|manga)/delete/:username')
	.post(function(req, res, next){
		if(!req.body._id) return next(new Error('No _id was sent'));

		var removeListItem = (listType === 'anime') ? { anime_list: { _id: req.body._id } } : { manga_list: { _id: req.body._id } };

		User.updateOne({
			$or: [
				{ _id: req.param('username') },
				{ username: req.param('username') }
			]
		}, {
			$pull: removeListItem
		}, function(err, status){
			if(err) return next(new Error(err));
			return res.status(200).json({ status: 'ok', message: 'Deleted list entry' });
		});
	});
	*/
}