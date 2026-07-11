function composeServices(deps) {
  var config = deps.config, clock = deps.clock, logger = deps.logger;
  var stores = deps.stores, httpClient = deps.httpClient;
  var snapshotStore = deps.snapshotStore, snapshotCache = deps.snapshotCache;
  var pinStore = deps.pinStore, publicationLock = deps.publicationLock;
  var operatingModeService = deps.operatingModeService;
  var publicationHistory = deps.publicationHistory;
  var notificationPort = deps.notificationPort;
  var mqttClient = deps.mqttClient;

  var path = require('path');
  var newsPipeline = null;
  var adminQueryService = null;
  var renderShadow = null;

  var PublicationService = require('../publication/publication-service').PublicationService;
  var pubService = PublicationService(
    snapshotStore, snapshotCache, pinStore, publicationLock,
    notificationPort, operatingModeService, publicationHistory, logger
  );

  try {
    var configObj = {
      lastGoodFile: stores.lastGoodNews ? stores.lastGoodNews._filePath || path.join(config.paths.dataDir, 'last_good_news.json') : path.join(config.paths.dataDir, 'last_good_news.json'),
      provider: config.translation ? config.translation.provider : 'none',
      apiKey: config.translation ? config.translation.apiKey : '',
      model: config.translation ? config.translation.model : '',
      baseUrl: config.translation ? config.translation.baseUrl : '',
    };
    var { createNewsPipeline } = require('../news/news-pipeline');
    newsPipeline = createNewsPipeline(configObj, logger);
  } catch (e) {
    logger.warn('newsPipeline init: ' + e.message);
  }

  try {
    var { createAdminQueryService } = require('../admin/admin-query-service');
    var assetRepository = null;
    try {
      var AssetRepository = require('../assets/asset-repository').AssetRepository;
      assetRepository = AssetRepository(config.paths.dataDir, logger);
    } catch (e) {}
    adminQueryService = createAdminQueryService(
      snapshotStore, publicationHistory, assetRepository, null, logger
    );
  } catch (e) {
    logger.warn('adminQueryService init: ' + e.message);
  }

  try {
    var { createRenderShadow } = require('../render/render-shadow');
    renderShadow = createRenderShadow(
      function(content, profileId) { return Promise.resolve(null); },
      function(content, profileId) { return Promise.resolve(null); },
      logger
    );
  } catch (e) {}

  return {
    newsPipeline: newsPipeline,
    publicationService: pubService,
    adminQueryService: adminQueryService,
    renderShadow: renderShadow,
  };
}

module.exports = { composeServices: composeServices };
