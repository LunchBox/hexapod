var RotationCalculator = function(bot, last_tip_positions) {
    this.bot = bot;
    this.last_tip_positions = last_tip_positions;

    var min_y = 100000;
    for(var idx in this.bot.legs){
        var tip_pos = this.bot.legs[idx].get_tip_pos();
        if (tip_pos.y < min_y) {
            min_y = tip_pos.y;
            this.on_floor_leg_idx = idx; 
        }
    }

    document.querySelector("#lowest_leg").innerHTML = this.on_floor_leg_idx;

    this.rotaiton_y = this.bot.mesh.rotation.y;

    this.distance = function(radius){
        this.bot.mesh.rotation.y = radius;

        var vec1 = this.last_tip_positions[this.on_floor_leg_idx];
        var vec2 = this.bot.legs[this.on_floor_leg_idx].get_tip_pos();

        return Math.sqrt(Math.pow(vec2.x - vec1.x, 2) + Math.pow(vec2.z - vec1.z, 2));
    }

    this.run = function() {
        if(typeof(this.on_floor_leg_idx) == "undefined"){
            return;
        }

        var count = 0; 
        var max_loops = 100;

        var min_radius = - Math.PI / 18;
        var max_radius = Math.PI / 18;
        
        var dist1, dist2;

        while ( (max_radius - min_radius) > Math.PI / 1800 && count < max_loops){
            // console.log("-- loop: " + count);
            
            dist1 = this.distance(this.rotaiton_y + min_radius);
            dist2 = this.distance(this.rotaiton_y + max_radius);

            if (dist1 > dist2) {
                min_radius += (max_radius - min_radius) / 2;
            } else if (dist1 < dist2) {
                max_radius -= (max_radius - min_radius) / 2;
            } else {
                break;
            }

            // console.log("-- min_radius: " + min_radius + ", max_radius: " + max_radius);

            count++;
        }
    };
}