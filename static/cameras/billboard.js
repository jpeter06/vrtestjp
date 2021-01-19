var Billboard = pc.createScript('billboard');

Billboard.prototype.initialize=function() {
	console.log("-------------> BILLBOARD INIT");
	this.app.on("cameraChanger:addedCamera", this.addCamera, this);
	this.lookat = true;
	this.counter = 0;
	this.inc=0;
};

Billboard.prototype.addCamera=function(camera){
 console.log("Billboard addCamera", camera);
// if(camera.name==="userC") 
     this.camera = camera;
};

// Called every frame, dt is time in seconds since last update
Billboard.prototype.update=function (dt) { 
	this.counter++;
	//if(this.counter % 200 == 0)
	//	console.log("Billboard ", this.lookat, this.camera, this.entity)
    if(this.camera){
		let titleText = this.entity.children[1];
		this.inc = (1 + this.inc)%360;
		//console.log("TT:",this.inc, titleText);
		titleText.setLocalEulerAngles(180,0,0)
		if(this.lookat){ 
		//	if(this.counter % 200 == 0)
		//		console.log("Billboard lookingAt Camera", this.camera.name, this.camera.getPosition().x, this.camera.getPosition().y, this.camera.getPosition().z);
			this.entity.lookAt(this.camera.getPosition(), pc.Vec3.DOWN);
		}else{
			//if(this.counter % 300 == 0)
			//	console.log("Billboard not lookingAt Camera", this.camera.name);
			this.entity.setRotation(this.camera.getRotation());
			var newAngle=Math.abs(this.camera.getEulerAngles().z)< 180 ? this.camera.getEulerAngles().y : 180 - this.camera.getEulerAngles().y;
			this.entity.setEulerAngles(0, newAngle, 0);
		}
    }
};

Billboard.prototype.swap = function(old) {
    this.camera=old.camera;
};
