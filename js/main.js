// Global dependencies which return no modules
require('./lib/canvasRenderingContext2DExtensions');
require('./lib/extenders');
require('./lib/plugins');

// External dependencies
var Hammer = require('hammerjs');
var Mousetrap = require('br-mousetrap');

// Method modules
var isMobileDevice = require('./lib/isMobileDevice');

// Game Objects
var SpriteArray = require('./lib/spriteArray');
var Monster = require('./lib/monster');
var Sprite = require('./lib/sprite');
var Snowboarder = require('./lib/snowboarder');
var Skier = require('./lib/skier');
var InfoBox = require('./lib/infoBox');
var Game = require('./lib/game');

// Local variables for starting the game
var mainCanvas = document.getElementById('skifree-canvas');
var dContext = mainCanvas.getContext('2d');
var imageSources = [ 'sprite-characters.png', 'skifree-objects.png' ];
var global = this;
var infoBoxControls = 'Use Mouse or WASD to control the player';
if (isMobileDevice()) infoBoxControls = 'Tap or drag to control the player';
var sprites = require('./spriteInfo');

var pixelsPerMetre = 18;
var distanceTravelledInMetres = 0;
var monsterDistanceThreshold = 2000;

var NUM_LIVES_MAX = 3;
var livesLeft = NUM_LIVES_MAX;
var loseLifeOnObstacleHit = true;

var dropRates = {smallTree: 4, tallTree: 3, jump: 1, thickSnow: 1, rock: 1};
var npcSpawnRate = 0.1;

var startTime = Date.now();
var upTime = 0;

var highScore = 0;
if (localStorage.getItem('highScore')) highScore = localStorage.getItem('highScore');

function loadImages (sources, next) {
	var loaded = 0;
	var images = {};

	function finish () {
		loaded += 1;
		if (loaded === sources.length) {
			next(images);
		}
	}

	sources.each(function (src) {
		var im = new Image();
		im.onload = finish;
		im.src = src;
		dContext.storeLoadedImage(src, im);
	});
}

function monsterHitsSkierBehaviour(monster, skier)
{
	skier.isEatenBy(monster, function ()
	{
		livesLeft -= 1;
		monster.isFull = true;
		monster.isEating = false;
		skier.isBeingEaten = false;
		monster.setSpeed(skier.getSpeed());
		monster.stopFollowing();
		var randomPositionAbove = dContext.getRandomMapPositionAboveViewport();
		monster.setMapPositionTarget(randomPositionAbove[0], randomPositionAbove[1]);
	});
}

function startNeverEndingGame (images) {
	var player;
	var startSign;
	var infoBox;
	var game;

	function resetGame () {
		distanceTravelledInMetres = 0;
		livesLeft = NUM_LIVES_MAX;
		highScore = localStorage.getItem('highScore');
		game.reset();
		game.addStaticObject(startSign);
		startTime = Date.now();
	}

	function detectEnd () {
		if (!game.isPaused())
		{
			if (localStorage.getItem('highScore'))
			{
				highScore = localStorage.getItem('highScore');

				if (highScore === undefined || distanceTravelledInMetres > highScore)
				{
					highScore = localStorage.setItem('highScore', distanceTravelledInMetres);
				}
			}
			else
			{
				highScore = distanceTravelledInMetres;
			}
			
			infoBox.setLines([
				'Game over!',
				'SCORE: ' + distanceTravelledInMetres,
				'High Score: ' + highScore,
				' ',
				'Press [Space] to reset.'
			]);
			game.pause();
			game.cycle();
		}
	}

	function randomlySpawnNPC(spawnFunction, dropRate) {
		var rateModifier = Math.max(800 - mainCanvas.width, 0);
		if (Number.random(1000 + rateModifier) <= dropRate) {
			spawnFunction();
		}
	}

	function spawnMonster () {
		var newMonster = new Monster(sprites.monster);
		var randomPosition = dContext.getRandomMapPositionAboveViewport();
		newMonster.setMapPosition(randomPosition[0], randomPosition[1]);
		newMonster.follow(player);
		newMonster.setSpeed(player.getStandardSpeed());
		newMonster.onHitting(player, monsterHitsSkierBehaviour);

		game.addMovingObject(newMonster, 'monster');
	}

	function spawnBoarder () {
		var newBoarder = new Snowboarder(sprites.snowboarder);
		var randomPositionAbove = dContext.getRandomMapPositionAboveViewport();
		var randomPositionBelow = dContext.getRandomMapPositionBelowViewport();
		newBoarder.setMapPosition(randomPositionAbove[0], randomPositionAbove[1]);
		newBoarder.setMapPositionTarget(randomPositionBelow[0], randomPositionBelow[1]);
		newBoarder.onHitting(player, sprites.snowboarder.hitBehaviour.skier);

		game.addMovingObject(newBoarder);
	}

	player = new Skier(sprites.skier);
	player.setMapPosition(0, 0);
	player.setMapPositionTarget(0, -10);
	if ( loseLifeOnObstacleHit ) {
		player.setHitObstacleCb(function() {
			livesLeft -= 1;
		});
	}

	game = new Game(mainCanvas, player);

	startSign = new Sprite(sprites.signStart);
	game.addStaticObject(startSign);
	startSign.setMapPosition(-50, 0);
	dContext.followSprite(player);

	infoBox = new InfoBox({
		initialLines : [
			'SkiFree.js',
			infoBoxControls,
			'Travelled 0m',
			'High Score: ' + highScore,
			'LIVES LEFT: ' + livesLeft
		],
		position: {
			top: 15,
			right: 10
		}
	});

	game.beforeCycle(function () {
		var newObjects = [];
		if (player.isMoving) {
			newObjects = Sprite.createObjects([
				{ sprite: sprites.smallTree, dropRate: dropRates.smallTree },
				{ sprite: sprites.tallTree, dropRate: dropRates.tallTree },
				{ sprite: sprites.jump, dropRate: dropRates.jump },
				{ sprite: sprites.thickSnow, dropRate: dropRates.thickSnow },
				{ sprite: sprites.rock, dropRate: dropRates.rock },
			], {
				rateModifier: Math.max(800 - mainCanvas.width, 0),
				position: function () {
					return dContext.getRandomMapPositionBelowViewport();
				},
				player: player
			});
		}
		if (!game.isPaused()) {
			game.addStaticObjects(newObjects);

			randomlySpawnNPC(spawnBoarder, npcSpawnRate);
			distanceTravelledInMetres = parseFloat(player.getPixelsTravelledDownMountain() / pixelsPerMetre).toFixed(1);

			if (distanceTravelledInMetres > monsterDistanceThreshold) {
				randomlySpawnNPC(spawnMonster, 0.001);
			}

			var printSpeed = 0;
			if (player.isMoving)
			{
				var printSpeed = player.getSpeed() * 3;
			}

			var deltaTime = Date.now() - startTime;
			upTime = Math.floor(deltaTime / 1000); // in seconds

			infoBox.setLines([
				'TIME: ' + upTime,
				'DIST: ' + distanceTravelledInMetres + 'm',
				'SPEED: ' + printSpeed + ' m/s',				
				'LIVES LEFT: ' + livesLeft,
				' ',
				infoBoxControls,
				' ',
				'High Score: ' + highScore,
				/*'Skier Map Position: ' + player.mapPosition[0].toFixed(1) + ', ' + player.mapPosition[1].toFixed(1),
				'Mouse Map Position: ' + mouseMapPosition[0].toFixed(1) + ', ' + mouseMapPosition[1].toFixed(1)*/
			]);
		}
	});

	game.afterCycle(function() {
		if (livesLeft === 0) {
			detectEnd();
		}
	});

	game.addUIElement(infoBox);
	
	$(mainCanvas)
	.mousemove(function (e) {
		game.setMouseX(e.pageX);
		game.setMouseY(e.pageY);
		player.resetDirection();
		player.startMovingIfPossible();
	})
	.bind('click', function (e) {
		game.setMouseX(e.pageX);
		game.setMouseY(e.pageY);
		player.resetDirection();
		player.startMovingIfPossible();
	})
	.focus(); // So we can listen to events immediately

	Mousetrap.bind('f', player.speedBoost);
	Mousetrap.bind('t', player.attemptTrick);
	Mousetrap.bind(['w', 'up'], function () {
		player.stop();
	});
	Mousetrap.bind(['a', 'left'], function () {
		if (player.direction === 270) {
			player.stepWest();
		} else {
			player.turnWest();
		}
	});
	Mousetrap.bind(['s', 'down'], function () {
		player.setDirection(180);
		player.startMovingIfPossible();
	});
	Mousetrap.bind(['d', 'right'], function () {
		if (player.direction === 90) {
			player.stepEast();
		} else {
			player.turnEast();
		}
	});
	Mousetrap.bind('m', spawnMonster);
	Mousetrap.bind('b', spawnBoarder);
	Mousetrap.bind('space', resetGame);

	var hammertime = Hammer(mainCanvas).on('press', function (e) {
		e.preventDefault();
		game.setMouseX(e.gesture.center.x);
		game.setMouseY(e.gesture.center.y);
	}).on('tap', function (e) {
		game.setMouseX(e.gesture.center.x);
		game.setMouseY(e.gesture.center.y);
	}).on('pan', function (e) {
		game.setMouseX(e.gesture.center.x);
		game.setMouseY(e.gesture.center.y);
		player.resetDirection();
		player.startMovingIfPossible();
	}).on('doubletap', function (e) {
		player.speedBoost();
	});

	player.isMoving = false;
	player.setDirection(270);

	game.start();
}

function resizeCanvas() {
	mainCanvas.width = window.innerWidth;
	mainCanvas.height = window.innerHeight;
}

window.addEventListener('resize', resizeCanvas, false);

resizeCanvas();

loadImages(imageSources, startNeverEndingGame);

this.exports = window;
