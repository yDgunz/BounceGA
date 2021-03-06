function BounceGA(gaConfig, fitnessConfig) {
	/* TO DO - fill in unprovided inputs */
	this.gaConfig = gaConfig;
	this.fitnessConfig = fitnessConfig;

	/* get axes for surfaces, surfaces will always have bottom edge perpendicular to y-axis */
	for (var i = 0; i < this.fitnessConfig.surfaces.length; i++) {	
		var surface = this.fitnessConfig.surfaces[i];
		surface.normal.normalize();
		var axis1;
		if (surface.normal.x == 0 && surface.normal.z == 0) {
			axis1 = new THREE.Vector3(1,0,0);
		} else {
			axis1 = new THREE.Vector3(-surface.normal.z,0,surface.normal.x);
		}
		var axis2 = (new THREE.Vector3()).crossVectors(surface.normal,axis1);
		axis1.normalize().multiplyScalar(surface.scale);
		axis2.normalize().multiplyScalar(surface.scale);
		surface.axis1 = axis1;
		surface.axis2 = axis2;
	}

	this.generations = 0;
	this.rankedPopulation = [];	// the current, ranked, population
	this.fittestMembers = []; // array of the fittest members by generation
	this.ableToFindSolution = undefined;

}

BounceGA.prototype.getBouncePath = function(v) {

	var pt = (new THREE.Vector3()).copy(this.fitnessConfig.p0); 
	var vt = (new THREE.Vector3()).copy(v);

	var p = [];
	p.push((new THREE.Vector3()).copy(pt));

	// reset surfaces 
	for (var i = 0; i < this.fitnessConfig.surfaces.length; i++) {
		this.fitnessConfig.surfaces[i].bounces = 0;
		this.fitnessConfig.surfaces[i].colliding = false;
	}

	var totalBounces = 0;
	var actualBounceOrder = [];

	var pTchoices = [];

	for (var t = 0; t <= this.fitnessConfig.maxT; t += this.fitnessConfig.dt) {

		// update position / velocity
		pt.add((new THREE.Vector3()).add(vt).multiplyScalar(this.fitnessConfig.dt));
		vt.y += this.fitnessConfig.G*this.fitnessConfig.dt;

		p.push((new THREE.Vector3()).copy(pt));

		// check for collisions
		for (var i = 0; i < this.fitnessConfig.surfaces.length; i++) {
			var surface = this.fitnessConfig.surfaces[i];	
			var distance = (surface.normal.x*pt.x + surface.normal.y*pt.y + surface.normal.z*pt.z - surface.normal.x*surface.position.x - surface.normal.y*surface.position.y - surface.normal.z*surface.position.z);

			if (
				Math.abs(distance) <= this.fitnessConfig.R // distance from plane is within radius
				&& Math.abs((new THREE.Vector3()).subVectors(pt,surface.position).dot(surface.axis1)) <= surface.scale // ball is within range of surface
				&& Math.abs((new THREE.Vector3()).subVectors(pt,surface.position).dot(surface.axis2)) <= surface.scale
				&& !surface.colliding
			) {
				surface.colliding = true;
				surface.bounces++;
				actualBounceOrder.push(i);
				totalBounces++;

				//new velocity from bounce
				var bounceV = (new THREE.Vector3()).copy(surface.normal);
				bounceV.multiplyScalar(vt.dot(surface.normal)).multiplyScalar(2*this.fitnessConfig.C);
				/* if the surface normal and the velocity are in opposite directions, make sure to negate the bounceV */
				bounceV.negate();
				vt.add(bounceV);

			} else if (Math.abs(distance) > this.fitnessConfig.R && surface.colliding) {
				surface.colliding = false;
			}

		}

		if (t >= this.fitnessConfig.minT) {	
			/* if bounce order is specified, check that it is followed */
			var correctBounceOrder = true;
			if (this.fitnessConfig.surfaceBounceOrder && actualBounceOrder.toString() != this.fitnessConfig.surfaceBounceOrder.toString()) {
				correctBounceOrder = false;
			}

			var enoughBounces = false;
			/* check that the total number of bounces was correct */
			if (totalBounces == this.fitnessConfig.numBounces) {
				enoughBounces = true;
			}

			// must match expected number of bounces, otherwise fitness is terrible
			if ( 
				correctBounceOrder
				&& enoughBounces
				&& ( (this.fitnessConfig.catchSign == 1 && vt.y >= 0) || (this.fitnessConfig.catchSign == -1 && vt.y <= 0 ) || this.fitnessConfig.catchSign == undefined ) 
				&& ( (this.fitnessConfig.tossSign == 1 && v.y >= 0) || (this.fitnessConfig.tossSign == -1 && v.y <= 0 ) || this.fitnessConfig.tossSign == undefined ) 
			) {
				pTchoices.push({
					pT: pt, 
					T: t,
					actualpT: this.fitnessConfig.pT // need this for comparator function below
				});
				//return {path: p, T: t};
			}
		}		

	}

	if (pTchoices.length > 0) {
		// go through pT choices and grab the best
		pTchoices.sort(function(a,b) { 
			return a.pT.distanceTo(a.actualpT) - b.pT.distanceTo(a.actualpT); 
		});

		return {path: p.splice(0,pTchoices[0].T/this.fitnessConfig.dt), T: pTchoices[0].T};
	} else {
		return {path: undefined, T: undefined};
	}

}

BounceGA.prototype.generateMember = function(parent) {	

	var v = new THREE.Vector3();

	if (parent && parent.fitness < 100) {

		if (Math.random() < this.gaConfig.mutationChance) {			
			v.x = (1-2*Math.random())*(parent.fitness < this.gaConfig.mutationScale ? parent.fitness : this.gaConfig.mutationScale);
			v.y = (1-2*Math.random())*(parent.fitness < this.gaConfig.mutationScale ? parent.fitness : this.gaConfig.mutationScale);
			v.z = (1-2*Math.random())*(parent.fitness < this.gaConfig.mutationScale ? parent.fitness : this.gaConfig.mutationScale);
			v.add(parent.v);
		} else {
			v.copy(parent.v);
		}
	} else {

		// v.x = getRandomV();
		// v.y = getRandomV();
		// v.z = getRandomV();
		
		// should always be tossing towards the first bounce surface
		// TO DO - get this working...

		var targetSurface;
		if(this.fitnessConfig.surfaceBounceOrder) {
			targetSurface = this.fitnessConfig.surfaces[this.fitnessConfig.surfaceBounceOrder[0]];
		} else {
			targetSurface = this.fitnessConfig.surfaces[Math.floor(Math.random()*this.fitnessConfig.surfaces.length)];
		}
		
		// first find a random spot on the surface
		v.copy(targetSurface.position);
		v.add((new THREE.Vector3()).copy(targetSurface.axis1).multiplyScalar(1-2*Math.random()));
		v.add((new THREE.Vector3()).copy(targetSurface.axis2).multiplyScalar(1-2*Math.random()));
		// save and remove the y component
		var targetY = v.y;
		v.y = 0;

		var p0copy = (new THREE.Vector3()).copy(this.fitnessConfig.p0);
		p0copy.y = 0;
		var pTcopy = (new THREE.Vector3()).copy(this.fitnessConfig.pT);
		pTcopy.y = 0;

		// the minimum possible velocity is for us to get to this spot at the half-way point
		// var minV = p0copy.distanceTo(v)+pTcopy.distanceTo(v) / (this.fitnessConfig.maxT);
		// maximum velocity is for us to go directly to the spot and back in minT
		// ACTUALLY THIS SHOULD BE HIGHER
		// var maxV = (p0copy.distanceTo(v)+pTcopy.distanceTo(v) / (this.fitnessConfig.minT))/this.fitnessConfig.C;
		var minV = 0;
		var maxV = this.gaConfig.initialScale;

		// create velocity vector from p0 to random spot on surface
		v.sub(this.fitnessConfig.p0);
		
		v.normalize();
		v.multiplyScalar(minV + (maxV-minV)*Math.random());

		// now get minV and maxV for y-component
		// the min velocity (or max velocity down) is either 0 if tossSign is 1 or targetY is above, or the time it takes to bounce back from straight down
		// this calculation is naively simplified to not consider C or G, may need to refactor
		minV = (this.fitnessConfig.tossSign == 1 || targetY > this.fitnessConfig.p0.y) ? 0 : -( (this.fitnessConfig.p0.y - targetY)*2 / (this.fitnessConfig.minT) );
		// the max velocity is either 0 if tossSign is -1 or the time it takes to get back from a straight toss up
		//maxV = (this.fitnessConfig.pT.y - this.fitnessConfig.p0.y - .5*this.fitnessConfig.G*this.fitnessConfig.maxT*this.fitnessConfig.maxT)/this.fitnessConfig.maxT;
		maxV = this.gaConfig.initialScale;

		v.y = minV + (maxV-minV)*Math.random();
	
	}

	var bouncePath = this.getBouncePath(v);

	return {
		v: v, 
		T: bouncePath.T,
		fitness: bouncePath.path ? bouncePath.path[bouncePath.path.length-1].distanceTo(this.fitnessConfig.pT) : 100
	};
}

BounceGA.prototype.evolve = function() {
	if (this.generations >= this.gaConfig.maxGenerations) {
		this.ableToFindSolution = false;
	} else if (this.rankedPopulation.length > 0 && this.rankedPopulation[0].fitness <= this.gaConfig.fitnessThreshold) {
		this.ableToFindSolution = true;
	} else {
		
		/* if this is first generation, we have no viable solutions yet, or we the noGA flag is set create them all from scratch */
		if (this.rankedPopulation.length == 0 || this.gaConfig.noGA) {
			this.rankedPopulation = []; // just make sure the population is empty
			for (var i = 0; i < this.gaConfig.populationSize; i++) {
				this.rankedPopulation.push(this.generateMember(undefined));
			}				
		} 
		/* otherwise create the next generation */
		else {
			/* we want to create a selection bias based on the fitness */
			var totalWeights = 0;
			var selectorHelper = []; 
			for (var i = 0; i < this.rankedPopulation.length; i++) {
				totalWeights += 1/this.rankedPopulation[i].fitness;
				selectorHelper.push(totalWeights);
			}
			/* select and mutate to create new members using the weighted selector helper array, so we'll pick more of the better members */
			var newPopulation = [];
			for (var i = 0; i < this.gaConfig.populationSize; i++) {
				// make half the population completely new members, the other half choose based on fitness
				if (i < this.gaConfig.populationSize/2) {
					newPopulation.push(this.generateMember(undefined));
				} else {
					var rand = Math.random()*totalWeights;
					for (var j = 0; j < selectorHelper.length; j++) {
						if (rand < selectorHelper[j]) {
							newPopulation.push(this.generateMember(this.rankedPopulation[j]));
							break;
						}
					}
				}		
			}
			this.rankedPopulation = newPopulation;			
		}

		/* sort population, hence the variable name */
		this.rankedPopulation.sort(function(a,b) { return a.fitness - b.fitness; });
		this.fittestMembers.push(this.rankedPopulation[0]);
		this.generations++;

		/* call evolve again, make sure to use setTimeout so we don't lock the browser */		
		var self = this;
		setTimeout(function() { self.evolve(); }, 0);
	}
}

function Animator(ga) {

	var 
		container,
		width,
		height,
		camera, 
		scene, 
		renderer,
		/* camera starting point */
		camTheta = Math.PI, 
		camPhi = .3, 
		camRadius = 5,
		/* helpers for mouse interaction */
		isMouseDown = false, 
		onMouseDownTheta, 
		onMouseDownPhi, 
		onMouseDownPosition;

	container = $('#animationContainer');

	width = container.width();
	height = container.height();

	camera = new THREE.PerspectiveCamera( 75, width / height, .05, 100 );
	updateCamera();

	scene = new THREE.Scene();

	/* lights */
	var ceilingLight = new THREE.PointLight( 0xffffff );
	ceilingLight.position.set(0,20,0);
	scene.add( ceilingLight );

	/* surfaces */
	for (var i = 0; i < ga.fitnessConfig.surfaces.length; i++) {
		
		var surface = ga.fitnessConfig.surfaces[i];
		var surfaceGeom = new THREE.Geometry();
		surfaceGeom.vertices.push( (new THREE.Vector3()).copy(surface.position).add((new THREE.Vector3()).add(surface.axis1).add(surface.axis2)) );
		surfaceGeom.vertices.push( (new THREE.Vector3()).copy(surface.position).add((new THREE.Vector3()).add(surface.axis1).negate().add(surface.axis2)) );
		surfaceGeom.vertices.push( (new THREE.Vector3()).copy(surface.position).add((new THREE.Vector3()).add(surface.axis1).add(surface.axis2).negate()) );
		surfaceGeom.vertices.push( (new THREE.Vector3()).copy(surface.position).add((new THREE.Vector3()).add(surface.axis2).negate().add(surface.axis1)) );

		surfaceGeom.faces.push( new THREE.Face3( 0, 1, 2 ) );
		surfaceGeom.faces.push( new THREE.Face3( 2, 0, 3 ) );

		var surfaceMesh = new THREE.Mesh(surfaceGeom, new THREE.MeshBasicMaterial( { color: 'grey', side: THREE.DoubleSide } ));
		scene.add(surfaceMesh);
	}

	/* draw ball */

	var ballMesh = new THREE.Mesh(new THREE.SphereGeometry( .1, 32, 32 ), new THREE.MeshBasicMaterial( { color: 'red' } ));
	ballMesh.position = ga.fitnessConfig.p0;
	scene.add(ballMesh);

	var targetMesh = new THREE.Mesh(new THREE.SphereGeometry( .1, 32, 32 ), new THREE.MeshBasicMaterial( { color: 'green' } ));
	targetMesh.position = ga.fitnessConfig.pT;
	scene.add(targetMesh);

	/* add axes for debugging */
	axes = buildAxes( 1 );
	scene.add(axes);

	/* create the renderer and add it to the canvas container */
	if( !window.WebGLRenderingContext ) {
		renderer = new THREE.CanvasRenderer();	
	} else {
		renderer = new THREE.WebGLRenderer( {antialias: true} );
	}

	renderer.setSize( width, height );

	container.empty();
	container.append(renderer.domElement);

	//add the event listeners for mouse interaction
	renderer.domElement.addEventListener( 'mousemove', onDocumentMouseMove, false );
	renderer.domElement.addEventListener( 'mousedown', onDocumentMouseDown, false );
	renderer.domElement.addEventListener( 'mouseup', onDocumentMouseUp, false );
	renderer.domElement.addEventListener( 'mousewheel', onDocumentMouseWheel, false );

	onMouseDownPosition = new THREE.Vector2();

	renderer.setClearColor( 0xffffff, 1);

	renderer.render(scene,camera);

	function updateCamera() {
		camera.position.x = camRadius * Math.sin( camTheta ) * Math.cos( camPhi );
		camera.position.y = camRadius * Math.sin( camPhi );
		camera.position.z = camRadius * Math.cos( camTheta ) * Math.cos( camPhi );
		camera.lookAt(new THREE.Vector3(0,1,0));
	}

	/* got the camera rotation code from: http://www.mrdoob.com/projects/voxels/#A/ */
	function onDocumentMouseDown( event ) {
		isMouseDown = true;
		onMouseDownTheta = camTheta;
		onMouseDownPhi = camPhi;
		onMouseDownPosition.x = event.clientX;
		onMouseDownPosition.y = event.clientY;
	}

	function onDocumentMouseMove( event ) {
		event.preventDefault();
		if ( isMouseDown ) {
			camTheta = - ( ( event.clientX - onMouseDownPosition.x ) * 0.01 ) + onMouseDownTheta;
			
			var dy = event.clientY - onMouseDownPosition.y;
			
			var newCamPhi = ( ( dy ) * 0.01 ) + onMouseDownPhi;

			if (newCamPhi < Math.PI/2 && newCamPhi > -Math.PI/2) {
				camPhi = newCamPhi;
			}
		}

		updateCamera();
		renderer.render(scene, camera);
	}

	function onDocumentMouseUp( event ) {
		event.preventDefault();
		isMouseDown = false;
	}

	function onDocumentMouseWheel( event ) { camRadius -= event.wheelDeltaY*.01; }

	function buildAxes( length ) {
	        var axes = new THREE.Object3D();

	        axes.add( buildAxis( new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( length, 0, 0 ), 0xFF0000 ) ); // +X
	        axes.add( buildAxis( new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( -length, 0, 0 ), 0xFF0000) ); // -X
	        axes.add( buildAxis( new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, length, 0 ), 0x00FF00 ) ); // +Y
	        axes.add( buildAxis( new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, -length, 0 ), 0x00FF00 ) ); // -Y
	        axes.add( buildAxis( new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, 0, length ), 0x0000FF ) ); // +Z
	        axes.add( buildAxis( new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, 0, -length ), 0x0000FF ) ); // -Z

	        return axes;

	}

	function buildAxis( src, dst, colorHex, dashed ) {
	        var geom = new THREE.Geometry(),
	            mat; 

	        if(dashed) {
	                mat = new THREE.LineDashedMaterial({ linewidth: 3, color: colorHex, dashSize: 3, gapSize: 3 });
	        } else {
	                mat = new THREE.LineBasicMaterial({ linewidth: 3, color: colorHex });
	        }

	        geom.vertices.push( src.clone() );
	        geom.vertices.push( dst.clone() );
	        geom.computeLineDistances(); // This one is SUPER important, otherwise dashed lines will appear as simple plain lines

	        var axis = new THREE.Line( geom, mat, THREE.LinePieces );

	        return axis;

	}

	this.animate = function(bouncePath,startTime) {
		if (startTime === undefined) {
			startTime = (new Date()).getTime();
		}

		var animationSpeed = 1;

		/* find time in the pattern and translate that to a discrete step in the prop position arrays */
		var timeElapsed = ((new Date()).getTime() - startTime)*animationSpeed/1000;
		var t = timeElapsed % bouncePath.T; // need to *1000 b/c timeElapsed is in ms
		var step = Math.floor(t/bouncePath.T*bouncePath.path.length);

		ballMesh.position = bouncePath.path[step];

		renderer.render(scene, camera);

		if (timeElapsed < bouncePath.T) {
			var self = this;
			requestAnimationFrame(function() { self.animate(bouncePath,startTime); });
		}
	}

}

function reportStats(ga) {
	var bestFitness;
	var T;
	if (ga.fittestMembers[ga.generations-1].fitness < 100) {
		bestFitness = ga.fittestMembers[ga.generations-1].fitness;
		T = ga.fittestMembers[ga.generations-1].T;
		var msg = 'Generation ' + ga.generations + ', best fitness: ' + bestFitness.toFixed(2) + ', ' + T.toFixed(2) + 's';
		$('#stats').append('<a href="#" onclick="animator.animate(ga.getBouncePath(ga.fittestMembers[' + (ga.generations-1).toString() + '].v))">'+msg+'</span><br/>');
	}

	if (ga.ableToFindSolution === undefined) {
		setTimeout(function() { reportStats(ga); },100);
	}	
}

function getConfigFromInput() {
	var input = $('#fitness').val().split('\n');
	/*
	p0.x,p0.y,p0.z,pT.x,pT.y,pT.z,T
	R,C
	numBounces,bounceOrder
	tossSign,catchSign
	surface1
	surface2
	surfaceN
	*/

	var posAndTime = input[0].split(',');
	var p0 = new THREE.Vector3(parseFloat(posAndTime[0]),parseFloat(posAndTime[1]),parseFloat(posAndTime[2]));
	var pT = new THREE.Vector3(parseFloat(posAndTime[3]),parseFloat(posAndTime[4]),parseFloat(posAndTime[5]));
	var minT = parseFloat(posAndTime[6]);
	var maxT = parseFloat(posAndTime[7]);

	var ballProperties = input[1].split(',');
	var R = parseFloat(ballProperties[0]);
	var C = parseFloat(ballProperties[1]);

	var bounces = input[2].split(',');
	var numBounces = parseInt(bounces[0]);
	var surfaceBounceOrder = undefined;
	if (bounces.length > 1) {
		surfaceBounceOrder = bounces.splice(1).map(function(a) { return parseInt(a); });
	}

	var tossCatchSigns = input[3].split(',');
	var tossSign = tossCatchSigns[0].trim() == 'u' ? undefined : parseInt(tossCatchSigns[0]);
	var catchSign = tossCatchSigns[1].trim() == 'u' ? undefined : parseInt(tossCatchSigns[1]);

	var surfaces = [];
	for (var i = 4; i < input.length; i++) {
		var surfaceProperties = input[i].split(',');
		var normal = new THREE.Vector3(parseFloat(surfaceProperties[0]),parseFloat(surfaceProperties[1]),parseFloat(surfaceProperties[2]));
		var position = new THREE.Vector3(parseFloat(surfaceProperties[3]),parseFloat(surfaceProperties[4]),parseFloat(surfaceProperties[5]));
		var scale = surfaceProperties[6];
		surfaces.push({
			normal: normal,
			position: position,
			scale: scale
		});
	}

	var fitnessConfig = {
		p0: p0,
		pT: pT,
		minT: minT,
		maxT: maxT,
		R: R,
		C: C,
		dt: .01,
		G: -9.8,
		numBounces: numBounces,
		surfaceBounceOrder: surfaceBounceOrder,
		tossSign: tossSign,
		catchSign: catchSign,
		surfaces: surfaces
	};
	
	input = $('#ga').val().split(',');

	var gaConfig = {
		maxGenerations: parseInt(input[0]),
		populationSize: parseInt(input[1]),
		mutationChance: parseFloat(input[2]),
		mutationScale: parseFloat(input[3]),
		initialScale: parseFloat(input[4]),
		fitnessThreshold: parseFloat(input[5]),
		noGA: input.length > 6 && input[6] == 1 ? true : false
	}

	return {fitnessConfig: fitnessConfig, gaConfig: gaConfig};
}

var ga;
var animator;

function go() {
	var configs = getConfigFromInput();
	ga = new BounceGA(configs.gaConfig,configs.fitnessConfig);
	var done = ga.evolve();

	animator = new Animator(ga);

	function runAnimation() {
		if (ga.ableToFindSolution == true) {
			animator.animate(ga.getBouncePath(ga.fittestMembers[ga.fittestMembers.length-1].v));
		} else {
			setTimeout(runAnimation,0);
		}
	}

	$('#stats').empty();
	setTimeout(function() { reportStats(ga); },0);
	
	setTimeout(runAnimation,0);
}

function setExample(i) {
	switch (i) {
		case 0:
			$('#fitness').val("-.5,1.5,0, .5,1.5,0, 1.5,2\n\
.05, .97\n\
1\n\
1, -1\n\
0,1,0, 0,0,0, 1");
			break;
		case 1:
			$('#fitness').val("-.5,1.5,0, .5,1.5,0, 2,2.1\n\
.05, .97\n\
2, 0,1\n\
u, u\n\
.4,1,-.3, -1,0,1, 1\n\
-.4,1,-.3, 1,0,1, 1");
			break;
		case 2:
			$('#fitness').val("-.5,1.5,0, .5,1.5,0, .3,1\n\
.05, .97\n\
2\n\
u, u\n\
1,0,0, 1,2,0, 2\n\
1,0,0, -1,2,0, 2");
			break; 
		case 3:
			$('#fitness').val("-.5,1.5,0, .5,1.5,0, 2,3\n\
.05, .97\n\
3, 1,2,0\n\
u, u\n\
1,0,0, 1,2,0, 1\n\
1,0,0, -1,2,0, 1\n\
0,1,0, 0,0,0, 1");
			break; 
	}
}

setExample(0);