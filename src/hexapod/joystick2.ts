export class JoyStick {
  container: HTMLElement;
  handler_activated: boolean;
  radius: number;
  margin: number;
  center_x: number;
  center_y: number;
  handler_radius: number;
  handler_x: number;
  handler_y: number;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  last_page_x: number;
  last_page_y: number;
  pos: { x: number; y: number };

  constructor(container_el: string | HTMLElement, radius: number) {
    this.container = typeof container_el === 'string'
      ? document.querySelector(container_el) as HTMLElement
      : container_el;

    this.handler_activated = false;

    this.radius = radius;
    this.margin = 20;

    this.center_x = this.radius + this.margin;
    this.center_y = this.radius + this.margin;

    this.handler_radius = 20;
    this.handler_x = this.center_x;
    this.handler_y = this.center_y;

    this.make_componemts();

    this.reset_handler();

    this.bind_events();
  }

  make_componemts() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.center_x * 2;
    this.canvas.height = this.center_y * 2;
    this.container.appendChild(this.canvas);

    this.context = this.canvas.getContext('2d')!;

    this.draw();
  }

  draw() {
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // range
    this.context.beginPath();
    this.context.lineWidth = 1;
    this.context.strokeStyle = '#333';
    this.context.arc(this.center_x, this.center_y, this.radius, 0, 2 * Math.PI, false);
    this.context.stroke();
    this.context.closePath();

    // handler
    this.context.beginPath();
    this.context.lineWidth = 3;
    this.context.strokeStyle = '#333';
    this.context.arc(this.handler_x, this.handler_y, this.handler_radius, 0, 2 * Math.PI, false);
    this.context.stroke();
    this.context.closePath();

    this.pos = this.translate_position();
    let msg = "x: " + this.pos.x.toFixed(1) + " y: " + this.pos.y.toFixed(1) + " radius: " + Math.sqrt(Math.pow(this.pos.x, 2) + Math.pow(this.pos.y, 2)).toFixed(1);
    this.context.fillText(msg, 2, 12);
  }

  translate_position() {
    return { x: this.handler_x - this.center_x, y: this.handler_y - this.center_y };
  }

  reset_handler() {
    this.handler_x = this.center_x;
    this.handler_y = this.center_y;
    this.handler_activated = false;
    this.draw();
    this.on_handler_deactivated();
  }

  handle_down(e_page_x: number, e_page_y: number) {
    let related_x = e_page_x - this.canvas.offsetLeft - this.center_x;
    let related_y = e_page_y - this.canvas.offsetTop - this.center_y;
    if (Math.sqrt(Math.pow(related_x, 2) + Math.pow(related_y, 2)) < this.handler_radius) {
      this.handler_activated = true;
    }
  }

  handle_move(e_page_x: number, e_page_y: number) {
    if (this.handler_activated) {
      let delta_x = 0;
      let delta_y = 0;
      if (typeof this.last_page_x !== "undefined") {
        delta_x = e_page_x - this.last_page_x;
        delta_y = e_page_y - this.last_page_y;
      }
      let target_x = this.handler_x + delta_x;
      let target_y = this.handler_y + delta_y;
      let target_radius = Math.sqrt(Math.pow(target_x - this.center_x, 2) + Math.pow(target_y - this.center_y, 2));
      if (target_radius > this.radius) {
        let rate = 1.0 * this.radius / target_radius;
        this.handler_x = this.center_x + (target_x - this.center_x) * rate;
        this.handler_y = this.center_y + (target_y - this.center_y) * rate;
      } else {
        this.handler_x = target_x;
        this.handler_y = target_y;
      }
      this.draw();
      this.on_handler_activated();
    }
    this.last_page_x = e_page_x;
    this.last_page_y = e_page_y;
  }

  mouse_move(e: MouseEvent) {
    e.preventDefault();
    this.handle_move(e.pageX, e.pageY);
  }

  mouse_down(e: MouseEvent) {
    e.preventDefault();
    this.handle_down(e.pageX, e.pageY);
  }

  mouse_up(e: MouseEvent) {
    e.preventDefault();
    this.reset_handler();
  }

  touch_start(e: TouchEvent) {
    e.preventDefault();
    this.handler_activated = true;
  }

  touch_move(e: TouchEvent) {
    e.preventDefault();
    let touchobj = e.changedTouches[0];
    this.handle_move(touchobj.pageX, touchobj.pageY);
  }

  touch_end(e: TouchEvent) {
    e.preventDefault();
    this.reset_handler();
  }

  on_handler_activated() { }
  on_handler_deactivated() { }

  bind_events() {
    this.canvas.addEventListener("mousedown", (e: MouseEvent) => {
      this.mouse_down(e);
    }, false);

    // Global listeners so dragging works even outside canvas
    document.addEventListener("mousemove", (e: MouseEvent) => {
      if (this.handler_activated) this.mouse_move(e);
    }, false);

    document.addEventListener("mouseup", (e: MouseEvent) => {
      if (this.handler_activated) this.mouse_up(e);
    }, false);

    // Auto-return to center when mouse leaves canvas during drag
    this.canvas.addEventListener("mouseleave", () => {
      if (this.handler_activated) this.reset_handler();
    }, false);
  }
}
