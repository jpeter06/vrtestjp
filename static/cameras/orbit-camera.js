////////////////////////////////////////////////////////////////////////////////
//                             Orbit Camera Script                            //
////////////////////////////////////////////////////////////////////////////////
var OrbitCamera = pc.createScript('orbitCamera');

OrbitCamera.attributes.add('distanceMax', { type: 'number', default: 0, title: 'Distance Max', description: 'Setting this at 0 will give an infinite distance limit' });
OrbitCamera.attributes.add('distanceMin', { type: 'number', default: 0, title: 'Distance Min' });
OrbitCamera.attributes.add('pitchAngleMax', { type: 'number', default: 90, title: 'Pitch Angle Max (degrees)' });
OrbitCamera.attributes.add('pitchAngleMin', { type: 'number', default: -90, title: 'Pitch Angle Min (degrees)' });

OrbitCamera.attributes.add('inertiaFactor', {
    type: 'number',
    default: 0,
    title: 'Inertia Factor',
    description: 'Higher value means that the camera will continue moving after the user has stopped dragging. 0 is fully responsive.'
});

OrbitCamera.attributes.add('focusEntity', {
    type: 'entity',
    title: 'Focus Entity',
    description: 'Entity for the camera to focus on. If blank, then the camera will use the whole scene'
});

OrbitCamera.attributes.add('defaultEntity', {
    type: 'entity',
    title: 'Default Entity',
    description: 'Entity for the camera to focus on when reselecting entity'
});

OrbitCamera.attributes.add('frameOnStart', {
    type: 'boolean',
    default: true,
    title: 'Frame on Start',
    description: 'Frames the entity or scene at the start of the application."'
});

OrbitCamera.attributes.add('app', {type: 'App', default: null, title: 'App', description: 'App."'});
OrbitCamera.attributes.add('cameras', {type: 'App', default: null, title: 'App', description: 'App."'});
OrbitCamera.attributes.add('entities', {type: 'App', default: null, title: 'App', description: 'App."'});


// Property to get and set the distance between the pivot point and camera
// Clamped between this.distanceMin and this.distanceMax
Object.defineProperty(OrbitCamera.prototype, "distance", {
    get: function () {
        return this._targetDistance;
    },

    set: function (value) {
        this._targetDistance = this._clampDistance(value);
    }
});


// Property to get and set the pitch of the camera around the pivot point (degrees)
// Clamped between this.pitchAngleMin and this.pitchAngleMax
// When set at 0, the camera angle is flat, looking along the horizon
Object.defineProperty(OrbitCamera.prototype, "pitch", {
    get: function () {
        return this._targetPitch;
    },

    set: function (value) {
        this._targetPitch = this._clampPitchAngle(value);
    }
});


// Property to get and set the yaw of the camera around the pivot point (degrees)
Object.defineProperty(OrbitCamera.prototype, "yaw", {
    get: function () {
        return this._targetYaw;
    },

    set: function (value) {
        this._targetYaw = value;
        // Ensure that the yaw takes the shortest route by making sure that
        // the difference between the targetYaw and the actual is 180 degrees
        // in either direction
        var diff = this._targetYaw - this._yaw;
        var reminder = diff % 360;
        if (reminder > 180) {
            this._targetYaw = this._yaw - (360 - reminder);
        } else if (reminder < -180) {
            this._targetYaw = this._yaw + (360 + reminder);
        } else {
            this._targetYaw = this._yaw + reminder;
        }
    }
});


// Property to get and set the world position of the pivot point that the camera orbits around
Object.defineProperty(OrbitCamera.prototype, "pivotPoint", {
    get: function () {
        return this._pivotPoint;
    },

    set: function (value) {
        this._pivotPoint.copy(value);
    }
});


// Moves the camera to look at an entity and all its children so they are all in the view
OrbitCamera.prototype.focus = function (focusEntity) {
	this.userAction();
    // Calculate an bounding box that encompasses all the models to frame in the camera view
    this._buildAabb(focusEntity, 0);

    var halfExtents = this._modelsAabb.halfExtents;
    var radius = Math.max(halfExtents.x, Math.max(halfExtents.y, halfExtents.z));
    this.distance = (radius * 1.5) / Math.sin(0.5 * this.entity.camera.fov * pc.math.DEG_TO_RAD);

    this._removeInertia();
    this._pivotPoint.copy(this._modelsAabb.center);
};


OrbitCamera.distanceBetween = new pc.Vec3();
OrbitCamera.selectedEntity = null;
OrbitCamera.selectedResult = null;
OrbitCamera.oldSelectedEntity = null;

OrbitCamera.prototype.userAction = function(){
	if(this.autoMoveStarted){
		console.log("stop automove: ", this.inertiaFactor);
		this.autoMoveStarted = false;
		this.inertiaFactor = 0.3;
	}
	this.lastUserAction = new Date();
};

OrbitCamera.prototype.execAutoUpdate = function(){
	if(this.autoMoveStarted){
		this.yaw += 0.1;
	}else{
		console.log("init automove: ", this.inertiaFactor);
		this.autoMoveStarted = true;
        this.inertiaFactor = 6;
        this.cameras.resetOrbitCamera();
	}
}

// Set the camera position to a world position and look at a world position
// Useful if you have multiple viewing angles to swap between in a scene
OrbitCamera.prototype.resetAndLookAtPoint = function (resetPoint, lookAtPoint) {
	this.userAction();
    this.pivotPoint.copy(lookAtPoint);
    this.entity.setPosition(resetPoint);
    this.entity.lookAt(lookAtPoint);

    var distance = OrbitCamera.distanceBetween;
    distance.sub2(lookAtPoint, resetPoint);
    this.distance = distance.length();

    this.pivotPoint.copy(lookAtPoint);

    var cameraQuat = this.entity.getRotation();
    this.yaw = this._calcYaw(cameraQuat);
    this.pitch = this._calcPitch(cameraQuat, this.yaw);

    this._removeInertia();
    this._updatePosition();
};


// Set camera position to a world position and look at an entity in the scene
// Useful if you have multiple models to swap between in a scene
OrbitCamera.prototype.resetAndLookAtEntity = function (resetPoint, entity) {
	console.log("resetAndLookAtEntity");
	this.userAction();
    this._buildAabb(entity, 0);
    this.resetAndLookAtPoint(resetPoint, this._modelsAabb.center);
};


// Set the camera at a specific, yaw, pitch and distance without inertia (instant cut)
OrbitCamera.prototype.reset = function (yaw, pitch, distance) {
    this.pitch = pitch;
    this.yaw = yaw;
    this.distance = distance;

    this._removeInertia();
};

OrbitCamera.prototype.smoothResetAndLookAtEntity = function(entity){
	this._buildAabb(entity, 0);
	var halfExtents = this._modelsAabb.halfExtents;
	
	//Cálculamos posición destino
    var radius = Math.max(halfExtents.x, Math.max(halfExtents.y, halfExtents.z));
	this.moveFrom = this.entity.getPosition().clone();
    var distanceTo = (radius * 1.5) / Math.sin(0.5 * this.entity.camera.fov * pc.math.DEG_TO_RAD);
	distanceTo = entity.name == "ground" ? distanceTo * 0.5: distanceTo;
	console.log("distanceTo",distanceTo);
	distanceTo = distanceTo < 2.8 ? 2.8 : distanceTo;
	var r = new pc.Vec3();
	r.sub2(this.moveFrom, entity.getPosition()).normalize().scale(distanceTo);
	var destino = entity.getPosition().clone();
	destino.add(r);
	this.moveTo = destino;
	
	//Lookat Change 
	this.moving=true;
	this.duration = 0.8;//Cambio entre posiciones seconds
	this.pivotFrom=this._pivotPoint.clone();
    this.pivotTo=this._modelsAabb.center;
	this.time = 0;
}

/////////////////////////////////////////////////////////////////////////////////////////////
// Private methods

/**
SoftMove to new Pivot point
	- soft look at
	- soft change distance to frame new object
**/
OrbitCamera.prototype.softmove = function(dt) {
	if(this.moving){
		this.time += dt; 
		if (this.time > this.duration) {
			this.moving=false;
		}else{
			var t = this.time / this.duration;
			t = t<.5 ? 2*t*t : -1+(4-2*t)*t;
			var angle = new pc.Vec2();
			var pivotTemp = new pc.Vec3();
			pivotTemp.lerp(this.pivotFrom, this.pivotTo, t);
			var posTemp = new pc.Vec3();
			posTemp.lerp(this.moveFrom, this.moveTo, t);
			//console.log("pivotTemp: ",pivotTemp,this.pivotFrom, this.pivotTo,percent,this.entity.getPosition());
			this.resetAndLookAtPoint(posTemp,pivotTemp);
		}    
	}    
};

OrbitCamera.prototype.initialize = function () {
    var self = this;
    console.log("self orbit:",self);
    var onWindowResize = function () {
        self._checkAspectRatio();
    };

	//Lookat Change soft
	this.moving=false;
	this.duration = 1;//Cambio entre posiciones seconds
	this.pivotFrom=null;
    this.pivotTo=null;
	this.time = 0;
	
	//Automove when no user action
	this.autoMove = true;
	this.autoMoveStarted = false;
	this.timeToMove = 30000; //Miliseconds
	this.lastUserAction = new Date();
	
	//Select entity
	this.selectedEntity = null;
	this.oldSelectedEntity = null;
	this.preSelectedEntity = null;

	
	console.log("focusEntitys:",this.focusEntity.name,"defaultEntity:", this.defaultEntity.name);
    window.addEventListener('resize', onWindowResize, false);

    this._checkAspectRatio();

    // Find all the models in the scene that are under the focused entity
    this._modelsAabb = new pc.BoundingBox();
    this._buildAabb(this.focusEntity || this.app.root, 0);

    this.entity.lookAt(this._modelsAabb.center);

    this._pivotPoint = new pc.Vec3();
    this._pivotPoint.copy(this._modelsAabb.center);

    // Calculate the camera euler angle rotation around x and y axes
    // This allows us to place the camera at a particular rotation to begin with in the scene
    var cameraQuat = this.entity.getRotation();

    // Preset the camera
    this._yaw = this._calcYaw(cameraQuat);
    this._pitch = this._clampPitchAngle(this._calcPitch(cameraQuat, this._yaw));
    this.entity.setLocalEulerAngles(this._pitch, this._yaw, 0);

    this._distance = 0;

    this._targetYaw = this._yaw;
    this._targetPitch = this._pitch;

    // If we have ticked focus on start, then attempt to position the camera where it frames
    // the focused entity and move the pivot point to entity's position otherwise, set the distance
    // to be between the camera position in the scene and the pivot point
    if (this.frameOnStart) {
        this.focus(this.focusEntity || this.app.root);
    } else {
        var distanceBetween = new pc.Vec3();
        distanceBetween.sub2(this.entity.getPosition(), this._pivotPoint);
        this._distance = this._clampDistance(distanceBetween.length());
    }

    this._targetDistance = this._distance;

    // Reapply the clamps if they are changed in the editor
    this.on('attr:distanceMin', function (value, prev) {
        this._distance = this._clampDistance(this._distance);
    });

    this.on('attr:distanceMax', function (value, prev) {
        this._distance = this._clampDistance(this._distance);
    });

    this.on('attr:pitchAngleMin', function (value, prev) {
        this._pitch = this._clampPitchAngle(this._pitch);
    });

    this.on('attr:pitchAngleMax', function (value, prev) {
        this._pitch = this._clampPitchAngle(this._pitch);
    });

    // Focus on the entity if we change the focus entity
    this.on('attr:focusEntity', function (value, prev) {
        if (this.frameOnStart) {
            this.focus(value || this.app.root);
        } else {
            this.resetAndLookAtEntity(this.entity.getPosition(), value || this.app.root);
        }
    });

    this.on('attr:frameOnStart', function (value, prev) {
        if (value) {
            this.focus(this.focusEntity || this.app.root);
        }
    });

    this.on('destroy', function () {
        window.removeEventListener('resize', onWindowResize, false);
    });
};


OrbitCamera.prototype.update = function (dt) {
	let now = new Date();
	if(this.entity.enabled && this.autoMove && 
		( now.getTime() - this.lastUserAction.getTime() ) > this.timeToMove){
		this.execAutoUpdate();
	}
	//soft change Pivot
	this.softmove(dt);
    // Add inertia, if any
    var t = this.inertiaFactor === 0 ? 1 : Math.min(dt / this.inertiaFactor, 1);
    this._distance = pc.math.lerp(this._distance, this._targetDistance, t);
    this._yaw = pc.math.lerp(this._yaw, this._targetYaw, t);
    this._pitch = pc.math.lerp(this._pitch, this._targetPitch, t);

    this._updatePosition();
};


OrbitCamera.prototype._updatePosition = function () {
    // Work out the camera position based on the pivot point, pitch, yaw and distance
    this.entity.setLocalPosition(0, 0, 0);
    this.entity.setLocalEulerAngles(this._pitch, this._yaw, 0);

    var position = this.entity.getPosition();
    position.copy(this.entity.forward);
    position.scale(-this._distance);
    position.add(this.pivotPoint);
    this.entity.setPosition(position);
};


OrbitCamera.prototype._removeInertia = function () {
    this._yaw = this._targetYaw;
    this._pitch = this._targetPitch;
    this._distance = this._targetDistance;
};


OrbitCamera.prototype._checkAspectRatio = function () {
    var height = this.app.graphicsDevice.height;
    var width = this.app.graphicsDevice.width;

    // Match the axis of FOV to match the aspect ratio of the canvas so
    // the focused entities is always in frame
    this.entity.camera.horizontalFov = height > width;
};


OrbitCamera.prototype._buildAabb = function (entity, modelsAdded) {
    var i = 0;
    if (entity.model) {
        var mi = entity.model.meshInstances;
        for (i = 0; i < mi.length; i++) {
            if (modelsAdded === 0) {
                this._modelsAabb.copy(mi[i].aabb);
            } else {
                this._modelsAabb.add(mi[i].aabb);
            }
            modelsAdded += 1;
        }
    }

    for (i = 0; i < entity.children.length; ++i) {
        modelsAdded += this._buildAabb(entity.children[i], modelsAdded);
    }

    return modelsAdded;
};


OrbitCamera.prototype._calcYaw = function (quat) {
    var transformedForward = new pc.Vec3();
    quat.transformVector(pc.Vec3.FORWARD, transformedForward);

    return Math.atan2(-transformedForward.x, -transformedForward.z) * pc.math.RAD_TO_DEG;
};


OrbitCamera.prototype._clampDistance = function (distance) {
    if (this.distanceMax > 0) {
        return pc.math.clamp(distance, this.distanceMin, this.distanceMax);
    }
    return Math.max(distance, this.distanceMin);

};


OrbitCamera.prototype._clampPitchAngle = function (pitch) {
    // Negative due as the pitch is inversed since the camera is orbiting the entity
    return pc.math.clamp(pitch, -this.pitchAngleMax, -this.pitchAngleMin);
};


OrbitCamera.quatWithoutYaw = new pc.Quat();
OrbitCamera.yawOffset = new pc.Quat();

OrbitCamera.prototype._calcPitch = function (quat, yaw) {
    var quatWithoutYaw = OrbitCamera.quatWithoutYaw;
    var yawOffset = OrbitCamera.yawOffset;

    yawOffset.setFromEulerAngles(0, -yaw, 0);
    quatWithoutYaw.mul2(yawOffset, quat);

    var transformedForward = new pc.Vec3();

    quatWithoutYaw.transformVector(pc.Vec3.FORWARD, transformedForward);

    return Math.atan2(transformedForward.y, -transformedForward.z) * pc.math.RAD_TO_DEG;
};


OrbitCamera.prototype.preselectEntity = function(event){
	this.selectedResult = this.selectObject(new pc.Vec2(event.x,event.y));
	this.selectedEntity = this.selectedResult ? this.selectedResult.entity : null;
    console.log("preselectEntity " + (this.selectedEntity? "name: "+ this.selectedEntity.name : ""))
	if(this.selectedEntity) {
        return this.selectedEntity;
	}
}

OrbitCamera.prototype.selectPreselectedEntity = function(event){
    console.log("selectPreselectedEntity")
    if(this.selectedEntity)
	    this.entities.selectEntity(this.selectedEntity, this.selectedResult);
}

OrbitCamera.prototype.unselectPreselectedEntity = function(){
    console.log("unselectPreselectedEntity")
    this.selectedEntity =  null;
    this.selectedResult = null;
}

OrbitCamera.prototype.selectEntity = function(event){ console.log("event.x:", event.x, event.y)
    var result = this.selectObject(new pc.Vec2(event.x,event.y));
    console.log("result",result)
	if(result && result.entity) {
        this.entities.selectEntity(result.entity, result);
    }
	this.selectEntityAux(result ? result.entity : null, event);	
}

OrbitCamera.prototype.selectEntityAux = function(selected, event){

	if(selected && selected == this.selectedEntity){
        if(selected.tags.has("button"))
            return;
		if(this.selectedEntity == this.oldSelectedEntity){	
			console.log("desenfocar");
			this.selectedEntity = this.defaultEntity;
			this.oldSelectedEntity = this.defaultEntity;
		}else{		
			console.log("enfocar");
			this.oldSelectedEntity = this.selectedEntity;
		}
		if(this.cameras.enableOrbitChange && event.altKey)
			this.smoothResetAndLookAtEntity( this.selectedEntity );
	}	
}

OrbitCamera.prototype.updatePropertiesSelectedEntity = function (event){
	var result = this.selectObject(new pc.Vec2(event.x,event.y));
    console.log("result select2 " + (result? "ok ": "nok ") + event.x +" " + event.y)
	if(result && result.entity == this.selectedEntity){
		this.entities.activateEntity(result.entity, result);
	}
}

OrbitCamera.prototype.selectObject =function(pos){
    var result=this.doRayCast(pos?{x:pos.x,y:pos.y}:{x:this.app.mouse._lastX,y:this.app.mouse._lastY});
    if(result && result.entity){        
        if(result.entity.model?.meshInstances.length > 0){
            for(let i=0; i < result.entity.model.meshInstances.length ; i++ ){
                const ray = this.createRay(pos);  
                let intersectResult = new pc.Vec3();   
                //console.log("AABB", 
                //    result.entity.model.meshInstances[i].node.name,
                //    result.entity.model.meshInstances[i].aabb.intersectsRay(ray, intersectResult) );
            }
        } //console.log("meshInstances:",result.entity.model?.meshInstances.length)
		return result;
    }
};

OrbitCamera.prototype.createRay = function(screenPosition){
    var camera=this.entity;
    var from = camera.camera.screenToWorld(screenPosition.x, screenPosition.y, camera.camera.nearClip);
    var to = camera.camera.screenToWorld(screenPosition.x, screenPosition.y, camera.camera.farClip);
    var r = new pc.Vec3();
    var dir = r.sub2(to, from);
    dir.normalize();   
    var ray = new pc.Ray(from, dir);
    //console.log("ray:",ray);
    return ray;
}

OrbitCamera.prototype.getFirstMeshSelectable =  function (screenPosition) {
    var camera=this.entity;
    var from = camera.camera.screenToWorld(screenPosition.x, screenPosition.y, camera.camera.nearClip);
    var to = camera.camera.screenToWorld(screenPosition.x, screenPosition.y, camera.camera.farClip);
    var result = this.app.systems.rigidbody.raycastFirst(from, to);
    if(result  && result.entity){
        //Recorrer MeshInstances
        // Solo tratar los que empiezan por "puerta", "ventana"
        // Lista de intersecciones OK + pto de interseccion Tupla [Mesh, intersectPoint]
        // De la lista obtengo el que este más cerca del "from"

        //Obtener objetos seleccionables y animables ("puerta", "ventana")
        //Estos objetos los metes en una lista estados ( inicial, final, animar=false, 90, dirección)
    }
};

OrbitCamera.prototype.doRayCast =  function (screenPosition) {
    var camera=this.entity;
    var from = camera.camera.screenToWorld(screenPosition.x, screenPosition.y, camera.camera.nearClip);
    var to = camera.camera.screenToWorld(screenPosition.x, screenPosition.y, camera.camera.farClip);
    return  this.app.systems.rigidbody.raycastFirst(from, to);
};

////////////////////////////////////////////////////////////////////////////////
//                       Orbit Camera Mouse Input Script                      //
////////////////////////////////////////////////////////////////////////////////
var OrbitCameraInputMouse = pc.createScript('orbitCameraInputMouse');

OrbitCameraInputMouse.attributes.add('orbitSensitivity', {
    type: 'number',
    default: 0.3,
    title: 'Orbit Sensitivity',
    description: 'How fast the camera moves around the orbit. Higher is faster'
});

OrbitCameraInputMouse.attributes.add('distanceSensitivity', {
    type: 'number',
    default: 0.25,
    title: 'Distance Sensitivity',
    description: 'How fast the camera moves in and out. Higher is faster'
});
OrbitCameraInputMouse.attributes.add('app', {
    type: 'pc.Application',
    default: null,
    title: 'Application',
    description: 'Application."'
});
// initialize code called once per entity
OrbitCameraInputMouse.prototype.initialize = function () {
    this.orbitCamera = this.entity.script.orbitCamera;
    console.log("orbitC.app",this.app);
	this.drag = 0;
    if (this.orbitCamera) {
        var self = this;

        var onMouseOut = function (e) {
            self.onMouseOut(e);
        };
		this.addEventsMouse();
        // Listen to when the mouse travels out of the window
        window.addEventListener('mouseout', onMouseOut, false);

        // Remove the listeners so if this entity is destroyed
        this.on('destroy', function () {
            this.removeEventsMouse();
            window.removeEventListener('mouseout', onMouseOut, false);
        });
    }

    this.app.mouse.disableContextMenu();

    this.lookButtonDown = false;
    this.panButtonDown = false;
    this.lastPoint = new pc.Vec2();
};

OrbitCameraInputMouse.prototype.addEventsMouse = function(){ console.log("THIS:",this);
	this.app.mouse.on(pc.EVENT_MOUSEDOWN, this.onMouseDown, this);
	this.app.mouse.on(pc.EVENT_MOUSEUP, this.onMouseUp, this);
	this.app.mouse.on(pc.EVENT_MOUSEMOVE, this.onMouseMove, this);
	this.app.mouse.on(pc.EVENT_MOUSEWHEEL, this.onMouseWheel, this);
}

OrbitCameraInputMouse.prototype.removeEventsMouse = function(){
	this.app.mouse.off(pc.EVENT_MOUSEDOWN, this.onMouseDown, this);
	this.app.mouse.off(pc.EVENT_MOUSEUP, this.onMouseUp, this);
	this.app.mouse.off(pc.EVENT_MOUSEMOVE, this.onMouseMove, this);
	this.app.mouse.off(pc.EVENT_MOUSEWHEEL, this.onMouseWheel, this);
}


OrbitCameraInputMouse.fromWorldPoint = new pc.Vec3();
OrbitCameraInputMouse.toWorldPoint = new pc.Vec3();
OrbitCameraInputMouse.worldDiff = new pc.Vec3();


OrbitCameraInputMouse.prototype.pan = function (screenPoint) {
    var fromWorldPoint = OrbitCameraInputMouse.fromWorldPoint;
    var toWorldPoint = OrbitCameraInputMouse.toWorldPoint;
    var worldDiff = OrbitCameraInputMouse.worldDiff;

    // For panning to work at any zoom level, we use screen point to world projection
    // to work out how far we need to pan the pivotEntity in world space
    var camera = this.entity.camera;
    var distance = this.orbitCamera.distance;

    camera.screenToWorld(screenPoint.x, screenPoint.y, distance, fromWorldPoint);
    camera.screenToWorld(this.lastPoint.x, this.lastPoint.y, distance, toWorldPoint);

    worldDiff.sub2(toWorldPoint, fromWorldPoint);

    this.orbitCamera.pivotPoint.add(worldDiff);
};


OrbitCameraInputMouse.prototype.onMouseDown = function (event) {
	this.drag = 0;
    switch (event.button) {
        case pc.MOUSEBUTTON_LEFT:
            this.lookButtonDown = true; console.log("mouseL")
			this.orbitCamera.preselectEntity(event);
            break;
        case pc.MOUSEBUTTON_MIDDLE:
        case pc.MOUSEBUTTON_RIGHT:
            this.panButtonDown = true; console.log("mouseR")
			this.orbitCamera.preselectEntity(event);
            break;
    }
};


OrbitCameraInputMouse.prototype.onMouseUp = function (event) {
    switch (event.button) {
        case pc.MOUSEBUTTON_LEFT:
            this.lookButtonDown = false;
			if(this.drag < 4){
				this.orbitCamera.selectEntity(event);
			}
            break;
        case pc.MOUSEBUTTON_MIDDLE:
        case pc.MOUSEBUTTON_RIGHT:
            this.panButtonDown = false;
			
			if(this.drag < 4){
				this.orbitCamera.updatePropertiesSelectedEntity(event);
			}
            break;
    }
};


OrbitCameraInputMouse.prototype.onMouseMove = function (event) {
	//this.selectedEntity = null;
	this.orbitCamera.userAction();
	this.drag++;
    if (this.lookButtonDown) {
        this.orbitCamera.pitch -= event.dy * this.orbitSensitivity;
        this.orbitCamera.yaw -= event.dx * this.orbitSensitivity;

    } else if (this.panButtonDown) {
        this.pan(event);
    }

    this.lastPoint.set(event.x, event.y);
};


OrbitCameraInputMouse.prototype.onMouseWheel = function (event) {
    this.orbitCamera.distance -= event.wheel * this.distanceSensitivity * (this.orbitCamera.distance * 0.1);
    event.event.preventDefault();
};


OrbitCameraInputMouse.prototype.onMouseOut = function (event) {
    this.lookButtonDown = false;
    this.panButtonDown = false;
};

OrbitCameraInputMouse.prototype.selectObject=function(pos){
    var result=this.doRayCast(pos?{x:pos.x,y:pos.y}:{x:this.app.mouse._lastX,y:this.app.mouse._lastY});
    if(result && result.entity){
		return result.entity;
    }
};

//rayCast
OrbitCameraInputMouse.prototype.doRayCast =  function (screenPosition) {
    var camera=this.entity;
    var from = camera.camera.screenToWorld(screenPosition.x, screenPosition.y, camera.camera.nearClip);
    var to = camera.camera.screenToWorld(screenPosition.x, screenPosition.y, camera.camera.farClip);
    return  this.app.systems.rigidbody.raycastFirst(from, to);
};


////////////////////////////////////////////////////////////////////////////////
//                       Orbit Camera Touch Input Script                      //
////////////////////////////////////////////////////////////////////////////////
var OrbitCameraInputTouch = pc.createScript('orbitCameraInputTouch');

OrbitCameraInputTouch.attributes.add('orbitSensitivity', {
    type: 'number',
    default: 0.4,
    title: 'Orbit Sensitivity',
    description: 'How fast the camera moves around the orbit. Higher is faster'
});

OrbitCameraInputTouch.attributes.add('distanceSensitivity', {
    type: 'number',
    default: 0.2,
    title: 'Distance Sensitivity',
    description: 'How fast the camera moves in and out. Higher is faster'
});

OrbitCameraInputTouch.attributes.add("doubleTapSpeed", {type: "number", default: 0.5, title: "Double Tap Speed", 
    description: "The maximum time (secs) allowed between tap to register as a double tap"
});


OrbitCameraInputTouch.attributes.add('app', {
    type: 'pc.Application',
    default: null,
    title: 'Application',
    description: 'Application."'
});

// initialize code called once per entity
OrbitCameraInputTouch.prototype.initialize = function () {
    this.orbitCamera = this.entity.script.orbitCamera;	
	this.timeLastTap = new Date().getTime();
	this.drag = 0;
	console.log("OrbitCameraInputTouch init", this.orbitCamera,this.app.touch);

    // Store the position of the touch so we can calculate the distance moved
    this.lastTouchPoint = new pc.Vec2();
    this.lastPinchMidPoint = new pc.Vec2();
    this.lastPinchDistance = 0;
	
	if(!this.app.touch)
	{
		console.log("TOUCH ACTIVE");
		this.app.touch = new pc.TouchDevice(window);
		this.app.touch.on(pc.EVENT_TOUCHSTART, this.onTouchDrag, this);
		this.app.touch.on(pc.EVENT_TOUCHEND, this.onTouchDragStop, this);
		this.app.touch.on(pc.EVENT_TOUCHMOVE, this.onTouchMove, this);
	}
	
    if (this.orbitCamera && this.app.touch) {
		console.log("OrbitCameraInputTouch init touch");
        // Use the same callback for the touchStart, touchEnd and touchCancel events as they
        // all do the same thing which is to deal the possible multiple touches to the screen
        this.app.touch.on(pc.EVENT_TOUCHSTART, this.onTouchStartEndCancel, this);
        this.app.touch.on(pc.EVENT_TOUCHEND, this.onTouchStartEndCancel, this);
        this.app.touch.on(pc.EVENT_TOUCHCANCEL, this.onTouchStartEndCancel, this);

        this.app.touch.on(pc.EVENT_TOUCHMOVE, this.onTouchMove, this);

        this.on('destroy', function () {
            this.app.touch.off(pc.EVENT_TOUCHSTART, this.onTouchStartEndCancel, this);
            this.app.touch.off(pc.EVENT_TOUCHEND, this.onTouchStartEndCancel, this);
            this.app.touch.off(pc.EVENT_TOUCHCANCEL, this.onTouchStartEndCancel, this);
            this.app.touch.off(pc.EVENT_TOUCHMOVE, this.onTouchMove, this);
        });
    }
};


OrbitCameraInputTouch.prototype.getPinchDistance = function (pointA, pointB) {
    // Return the distance between the two points
    var dx = pointA.x - pointB.x;
    var dy = pointA.y - pointB.y;

    return Math.sqrt((dx * dx) + (dy * dy));
};


OrbitCameraInputTouch.prototype.calcMidPoint = function (pointA, pointB, result) {
    result.set(pointB.x - pointA.x, pointB.y - pointA.y);
    result.scale(0.5);
    result.x += pointA.x;
    result.y += pointA.y;
};


OrbitCameraInputTouch.prototype.onTouchStartEndCancel = function (event) {
    // We only care about the first touch for camera rotation. As the user touches the screen,
    // we stored the current touch position
	console.log("ORB--> touch drag:  " + this.drag);
    var touches = event.touches;
	if(touches.length == 0){
		if(this.drag == 1){
            console.log("ORB--> drag1 and selectEntity: " + (this.orbitCamera.selectedEntity ? "ok" : "nok"))
            
            if( this.orbitCamera.oldSelect !== this.orbitCamera.selectedEntity){
                this.newTime = new Date().getTime();
                if(this.newTime - this.timeLastTap > 400){
                    console.log("ORB--> activateEntity ",this.orbitCamera.selectedEntity.name,this.orbitCamera.selectedEntity)
                    this.orbitCamera.entities.activateEntity(this.orbitCamera.selectedEntity, true);
                    /*
                    let che = this.app.root.findByName("che");
			        if(che)
                    this.orbitCamera.entities.activateEntity(che,true);
                    */
                }else{
                    this.orbitCamera.selectPreselectedEntity(event);
                }
            }
			    
            /*
			console.log("touched:", this.selectedEntity.name);
			this.selectedEntity.animar = ! this.selectedEntity.animar;
			this.orbitCamera.updateColors(this.selectedEntity);*/
		}
		this.drag = 0;
		this.orbitCamera.unselectPreselectedEntity(event);
		//this.selectedEntity = null;
	}else if (touches.length == 1) {
		this.drag++;
        this.oldTimeLastTap = this.timeLastTap;
        this.timeLastTap = new Date().getTime();
        console.log("ORB-->DIF:", (this.timeLastTap - this.oldTimeLastTap))
        this.lastTouchPoint.set(touches[0].x, touches[0].y);
		if(this.drag == 1) {//Marcamos para selección
            this.oldSelect = this.orbitCamera.selectedEntity;
			this.orbitCamera.preselectEntity(new pc.Vec2(touches[0].x, touches[0].y));
            if( this.orbitCamera.oldSelect === this.orbitCamera.selectedEntity 
                && (this.timeLastTap - this.oldTimeLastTap) < 700){ //Mismo entity en poco tiempo
                    console.log("ORB--> ACTIVAMOS")
                this.orbitCamera.entities.activateEntity(this.orbitCamera.selectedEntity, true);
            }    
        }
    } else if (touches.length == 2) {		
		this.drag++;
        // If there are 2 touches on the screen, then set the pinch distance
        this.lastPinchDistance = this.getPinchDistance(touches[0], touches[1]);
        this.calcMidPoint(touches[0], touches[1], this.lastPinchMidPoint);
    }
   // event.event.preventDefault();
};


OrbitCameraInputTouch.fromWorldPoint = new pc.Vec3();
OrbitCameraInputTouch.toWorldPoint = new pc.Vec3();
OrbitCameraInputTouch.worldDiff = new pc.Vec3();


OrbitCameraInputTouch.prototype.pan = function (midPoint) {
    var fromWorldPoint = OrbitCameraInputTouch.fromWorldPoint;
    var toWorldPoint = OrbitCameraInputTouch.toWorldPoint;
    var worldDiff = OrbitCameraInputTouch.worldDiff;

    // For panning to work at any zoom level, we use screen point to world projection
    // to work out how far we need to pan the pivotEntity in world space
    var camera = this.entity.camera;
    var distance = this.orbitCamera.distance;

    camera.screenToWorld(midPoint.x, midPoint.y, distance, fromWorldPoint);
    camera.screenToWorld(this.lastPinchMidPoint.x, this.lastPinchMidPoint.y, distance, toWorldPoint);

    worldDiff.sub2(toWorldPoint, fromWorldPoint);

    this.orbitCamera.pivotPoint.add(worldDiff);
};


OrbitCameraInputTouch.pinchMidPoint = new pc.Vec2();

OrbitCameraInputTouch.prototype.onTouchMove = function (event) {
	this.orbitCamera.userAction();
	this.drag++;
    var pinchMidPoint = OrbitCameraInputTouch.pinchMidPoint;

    // We only care about the first touch for camera rotation. Work out the difference moved since the last event
    // and use that to update the camera target position
    var touches = event.touches;
    if (touches.length == 1) {
        var touch = touches[0];

        this.orbitCamera.pitch -= (touch.y - this.lastTouchPoint.y) * this.orbitSensitivity;
        this.orbitCamera.yaw -= (touch.x - this.lastTouchPoint.x) * this.orbitSensitivity;

        this.lastTouchPoint.set(touch.x, touch.y);

    } else if (touches.length == 2) {
        // Calculate the difference in pinch distance since the last event
        var currentPinchDistance = this.getPinchDistance(touches[0], touches[1]);
        var diffInPinchDistance = currentPinchDistance - this.lastPinchDistance;
        this.lastPinchDistance = currentPinchDistance;

        this.orbitCamera.distance -= (diffInPinchDistance * this.distanceSensitivity * 0.1) * (this.orbitCamera.distance * 0.1);

        // Calculate pan difference
        this.calcMidPoint(touches[0], touches[1], pinchMidPoint);
        this.pan(pinchMidPoint);
        this.lastPinchMidPoint.copy(pinchMidPoint);
    }
};

OrbitCameraInputTouch.prototype.selectObject=function(pos){ console.log("pos:",pos);
    var result=this.doRayCast(pos?{x:pos.x,y:pos.y}:{x:this.app.mouse._lastX,y:this.app.mouse._lastY});
	//console.log("selectObject:",pos,this.app.mouse._lastX, result);
    if(result && result.entity){
		return result.entity;
    }
};

//rayCast
OrbitCameraInputTouch.prototype.doRayCast =  function (screenPosition) {
    var camera=this.entity;
    var from = camera.camera.screenToWorld(screenPosition.x, screenPosition.y, camera.camera.nearClip);
    var to = camera.camera.screenToWorld(screenPosition.x, screenPosition.y, camera.camera.farClip);
    return  this.app.systems.rigidbody.raycastFirst(from, to);
};
