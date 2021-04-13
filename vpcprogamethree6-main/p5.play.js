/*
p5.play
por Paolo Pedercini/molleindustria, 2015
http://molleindustria.org/
*/

(function(root, factory) {
if (typeof define === 'function' && define.amd)
define('p5.play', ['@code-dot-org/p5'], function(p5) { (factory(p5)); });
else if (typeof exports === 'object')
factory(require('@code-dot-org/p5'));
else
factory(root.p5);
}(this, function(p5) {
/**
 * p5.play es una biblioteca para p5.js que facilita la creación de juegos y proyectos de tipo
 * gamelike.
 *
 * Proporciona una clase Sprite flexible para gestionar objetos visuales en el espacio 2D 
 * y características como soporte de animación, detección y resolución básica de colisiones,
 * interacciones con el ratón y el teclado, y una cámara virtual.
 *
 * 5.play no es un motor de física derivado de box2D, no utiliza eventos, y está
 * para ser entendido y posiblemente modificado por programadores intermedios.
 *
 * Consultar la carpeta de ejemplos para obtener más información sobre cómo utilizar esta biblioteca.
 *
 * @module p5.play
 * @submodule p5.play
 * @for p5.play
 * @main
 */

// =============================================================================
//                         inicialización
// =============================================================================

var DEFAULT_FRAME_RATE = 30;

// Esta es la nueva forma de inicializar propiedades p5 personalizadas para cualquier instancia p5.
// El objetivo es migrar las propiedades perezosas de P5 a este método.
// @ver https://github.com/molleindustria/p5.play/issues/46
p5.prototype.registerMethod('init', function p5PlayInit() {
  /**
   * La cámara de bocetos se crea automáticamente al principio de un boceto.
   * Una cámara facilita el desplazamiento y el zoom para las escenas que se extienden más allá
   * del canvas. Una cámara tiene una posición, un factor de zoom y las coordenadas del ratón
   * relativas a la vista.
   *
   * En términos de p5.js la cámara envuelve todo el ciclo de dibujo en una
   * matriz de transformación, pero puede ser desactivada en cualquier momento durante el ciclo de dibujo,
   * por ejemplo para dibujar elementos de la interfaz en una posición absoluta.
   *
   * @property camera
   * @type {camera}
   */
  this.camera = new Camera(this, 0, 0, 1);
  this.camera.init = false;

  this.angleMode(this.DEGREES);
  this.frameRate(DEFAULT_FRAME_RATE);

  this._defaultCanvasSize = {
    width: 400,
    height: 400
  };

  var startDate = new Date();
  this._startTime = startDate.getTime();

  // Canvas temporal para soportar las operaciones de tintado de los elementos de la imagen;
  // ver p5.prototype.imageElement()
  this._tempCanvas = document.createElement('canvas');
});

// Esto nos proporciona una manera de definir perezosamente las propiedades que
// son globales para las instancias de p5.
//
// Tenga en cuenta que esto no es sólo una optimización: p5 actualmente no proporciona 
// ninguna manera de que los complementos sean notificados cuando se crean nuevas instancias de p5,
// por lo que la creación perezosa de estas propiedades es el *único* mecanismo disponible
// para nosotros. Para más información, ver:
//
// https://github.com/processing/p5.js/issues/1263
function defineLazyP5Property(name, getter) {
  Object.defineProperty(p5.prototype, name, {
    configurable: true,
    enumerable: true,
    get: function() {
      var context = (this instanceof p5 && !this._isGlobal) ? this : window;

      if (typeof(context._p5PlayProperties) === 'indefinido') {
        context._p5PlayProperties = {};
      }
      if (!(name in context._p5PlayProperties)) {
        context._p5PlayProperties[name] = getter.call(context);
      }
      return context._p5PlayProperties[name];
    }
  });
}

// Esto devuelve una función de fábrica, adecuada para pasarla a
// defineLazyP5Property, que devuelve una subclase del constructor dado
// que siempre está vinculado a una instancia p5 particular.
function boundConstructorFactory(constructor) {
  if (typeof(constructor) !== 'function')
    throw new Error('el constructor debe ser una función');

  return function createBoundConstructor() {
    var pInst = this;

    function F() {
      var args = Array.prototype.slice.call(arguments);

      return constructor.apply(this, [pInst].concat(args));
    }
    F.prototype = constructor.prototype;

    return F;
  };
}

// Esta es una utilidad que facilita la definición de alias convenientes para
// los métodos de instancia p5 previnientes.
//
// Por ejemplo:
//
//   var pInstBind = createPInstBinder(pInst);
//
//   var createVector = pInstBind('createVector');
//   var loadImage = pInstBind('loadImage');
//
// Lo anterior creará las funciones createVector y loadImage, que pueden
// usarse de forma similar al modo global de p5 -sin embargo, están vinculadas a instancias específicas de p5,
// y por lo tanto pueden usarse fuera del modo global.
function createPInstBinder(pInst) {
  return function pInstBind(methodName) {
    var method = pInst[methodName];

    if (typeof(method) !== 'function')
      throw new Error('"' + methodName + '" no es un método p5');
    return method.bind(pInst);
  };
}

// Estas son funciones p5 de utilidad que no dependen del estado de la instancia p5
// para funcionar correctamente, así que seguiremos adelante y las
// haremos de fácil acceso sin necesidad de vincularlas a una instancia p5.
var abs = p5.prototype.abs;
var radians = p5.prototype.radians;
var degrees = p5.prototype.degrees;

// =============================================================================
//                         anulaciones de p5
// =============================================================================

// Hacer que el color de relleno sea por defecto gris (127, 127, 127) cada vez que se crea un
// nuevo canvas.
if (!p5.prototype.originalCreateCanvas_) {
  p5.prototype.originalCreateCanvas_ = p5.prototype.createCanvas;
  p5.prototype.createCanvas = function() {
    var result = this.originalCreateCanvas_.apply(this, arguments);
    this.fill(this.color(127, 127, 127));
    return result;
  };
}

// Hacer que la anchura y la altura sean opcionales para ellipse() - por defecto 50
// Guarda la implementación original para permitir parámetros opcionales.
if (!p5.prototype.originalEllipse_) {
  p5.prototype.originalEllipse_ = p5.prototype.ellipse;
  p5.prototype.ellipse = function(x, y, w, h) {
    w = (w) ? w : 50;
    h = (w && !h) ? w : h;
    this.originalEllipse_(x, y, w, h);
  };
}

// Hacer que la anchura y la altura sean opcionales para rect() - por defecto 50
// Guarda la implementación original para permitir parámetros opcionales.
if (!p5.prototype.originalRect_) {
  p5.prototype.originalRect_ = p5.prototype.rect;
  p5.prototype.rect = function(x, y, w, h) {
    w = (w) ? w : 50;
    h = (w && !h) ? w : h;
    this.originalRect_(x, y, w, h);
  };
}

// Modificar p5 para ignorar las posiciones fuera de los límites antes de establecer touchIsDown
p5.prototype._ontouchstart = function(e) {
  if (!this._curElement) {
    return;
  }
  var validTouch;
  for (var i = 0; i < e.touches.length; i++) {
    validTouch = getTouchInfo(this._curElement.elt, e, i);
    if (validTouch) {
      break;
    }
  }
  if (!validTouch) {
    // No hay toques dentro de los límites (válidos), volver e ignorar:
    return;
  }
  var context = this._isGlobal ? window : this;
  var executeDefault;
  this._updateNextTouchCoords(e);
  this._updateNextMouseCoords(e);
  this._setProperty('touchIsDown', true);
  if (typeof context.touchStarted === 'function') {
    executeDefault = context.touchStarted(e);
    if (executeDefault === false) {
      e.preventDefault();
    }
  } else if (typeof context.mousePressed === 'function') {
    executeDefault = context.mousePressed(e);
    if (executeDefault === false) {
      e.preventDefault();
    }
    //this._setMouseButton(e);
  }
};

// Modificar p5 para manejar las transformaciones de CSS (escala) e ignorar las posiciones
// fuera de los límites antes de informar de las coordenadas táctiles
//
// NOTA: _updateNextTouchCoords() es casi idéntica, pero llama a una función getTouchInfo() modificada
// que escala la posición del toque con el espacio de
// juego y puede devolver undefined
p5.prototype._updateNextTouchCoords = function(e) {
  var x = this.touchX;
  var y = this.touchY;
  if (e.type === 'mousedown' || e.type === 'mousemove' ||
      e.type === 'mouseup' || !e.touches) {
    x = this.mouseX;
    y = this.mouseY;
  } else {
    if (this._curElement !== null) {
      var touchInfo = getTouchInfo(this._curElement.elt, e, 0);
      if (touchInfo) {
        x = touchInfo.x;
        y = touchInfo.y;
      }

      var touches = [];
      var touchIndex = 0;
      for (var i = 0; i < e.touches.length; i++) {
        // Sólo algunos toques son válidos - sólo introduce toques válidos en el
        // array de la propiedad `touches`.
        touchInfo = getTouchInfo(this._curElement.elt, e, i);
        if (touchInfo) {
          touches[touchIndex] = touchInfo;
          touchIndex++;
        }
      }
      this._setProperty('touches', touches);
    }
  }
  this._setProperty('touchX', x);
  this._setProperty('touchY', y);
  if (!this._hasTouchInteracted) {
    // Para el primer sorteo, haz que el anterior y el siguiente sean iguales
    this._updateTouchCoords();
    this._setProperty('_hasTouchInteracted', true);
  }
};

// NOTA: devuelve undefined si la posición está fuera del rango válido
function getTouchInfo(canvas, e, i) {
  i = i || 0;
  var rect = canvas.getBoundingClientRect();
  var touch = e.touches[i] || e.changedTouches[i];
  var xPos = touch.clientX - rect.left;
  var yPos = touch.clientY - rect.top;
  if (xPos >= 0 && xPos < rect.width && yPos >= 0 && yPos < rect.height) {
    return {
      x: Math.round(xPos * canvas.offsetWidth / rect.width),
      y: Math.round(yPos * canvas.offsetHeight / rect.height),
      id: touch.identifier
    };
  }
}

// Modificar p5 para ignorar las posiciones fuera de los límites antes de establecer mouseIsPressed
// y isMousePressed
p5.prototype._onmousedown = function(e) {
  if (!this._curElement) {
    return;
  }
  if (!getMousePos(this._curElement.elt, e)) {
    // No está dentro de los límites, regresa e ignora:
    return;
  }
  var context = this._isGlobal ? window : this;
  var executeDefault;
  this._setProperty('isMousePressed', true);
  this._setProperty('mouseIsPressed', true);
  this._setMouseButton(e);
  this._updateNextMouseCoords(e);
  this._updateNextTouchCoords(e);
  if (typeof context.mousePressed === 'function') {
    executeDefault = context.mousePressed(e);
    if (executeDefault === false) {
      e.preventDefault();
    }
  } else if (typeof context.touchStarted === 'function') {
    executeDefault = context.touchStarted(e);
    if (executeDefault === false) {
      e.preventDefault();
    }
  }
};

// Modificar p5 para manejar las transformaciones CSS (escala) e ignorar las posiciones
// fuera de los límites antes de informar de las coordenadas del ratón
//
// NOTA: _updateNextMouseCoords() es casi idéntica, pero llama a una función getMousePos() modificada
// que escala la posición del ratón con el espacio de
// juego y puede devolver un indefinido.
p5.prototype._updateNextMouseCoords = function(e) {
  var x = this.mouseX;
  var y = this.mouseY;
  if (e.type === 'touchstart' || e.type === 'touchmove' ||
      e.type === 'touchend' || e.touches) {
    x = this.touchX;
    y = this.touchY;
  } else if (this._curElement !== null) {
    var mousePos = getMousePos(this._curElement.elt, e);
    if (mousePos) {
      x = mousePos.x;
      y = mousePos.y;
    }
  }
  this._setProperty('mouseX', x);
  this._setProperty('mouseY', y);
  this._setProperty('winMouseX', e.pageX);
  this._setProperty('winMouseY', e.pageY);
  if (!this._hasMouseInteracted) {
    // Para el primer sorteo, haz que el anterior y el siguiente sean iguales
    this._updateMouseCoords();
    this._setProperty('_hasMouseInteracted', true);
  }
};

// NOTA: devuelve un indefinido si la posición está fuera del rango válido
function getMousePos(canvas, evt) {
  var rect = canvas.getBoundingClientRect();
  var xPos = evt.clientX - rect.left;
  var yPos = evt.clientY - rect.top;
  if (xPos >= 0 && xPos < rect.width && yPos >= 0 && yPos < rect.height) {
    return {
      x: Math.round(xPos * canvas.offsetWidth / rect.width),
      y: Math.round(yPos * canvas.offsetHeight / rect.height)
    };
  }
}

// =============================================================================
//                         extensiones p5
// TODO: Estaría bien que se aceptaran en p5
// =============================================================================

/**
 * Proyecta un vector sobre la recta paralela a un segundo vector, dando un tercer
 * vector que es la proyección ortogonal de ese vector sobre la recta.
 * @see https://en.wikipedia.org/wiki/Vector_projection
 * @method project
 * @for p5.Vector
 * @static
 * @param {p5.Vector} a - vector que se proyecta
 * @param {p5.Vector} b - vector que define la línea de destino de la proyección.
 * @return {p5.Vector} proyección de a sobre la recta paralela a b.
 */
p5.Vector.project = function(a, b) {
  return p5.Vector.mult(b, p5.Vector.dot(a, b) / p5.Vector.dot(b, b));
};

/**
 * Pregunta si un vector es paralelo a éste.
 * @method isParallel
 * @for p5.Vector
 * @param {p5.Vector} v2
 * @param {number} [tolerance] - El margen de error para las comparaciones, entra en
 *        juego cuando se comparan vectores rotados.  Por ejemplo, queremos que
 *        <1, 0> sea paralelo a <0, 1>.rot(Math.PI/2) pero la imprecisión
 *        de los flotadores puede interponerse.
 * @return {boolean}
 */
p5.Vector.prototype.isParallel = function(v2, tolerance) {
  tolerance = typeof tolerance === 'number' ? tolerance : 1e-14;
  return (
      Math.abs(this.x) < tolerance && Math.abs(v2.x) < tolerance
    ) || (
      Math.abs(this.y ) < tolerance && Math.abs(v2.y) < tolerance
    ) || (
      Math.abs(this.x / v2.x - this.y / v2.y) < tolerance
    );
};

// =============================================================================
//                         adiciones de p5
// =============================================================================

/**
 * Carga una imagen desde una ruta y crea una Imagen a partir de ella.
 * <br><br>
 * La imagen puede no estar disponible inmediatamente para su renderización
 * Si quiere asegurarse de que la imagen está lista antes de hacer algo
 * coloque la enntrada a loadImageElement() en preload().
 * También puede suministrar una función de devolución de llamada para manejar la imagen cuando esté lista.
 * <br><br>
 * La ruta de la imagen debe ser relativa al archivo HTML 
 * que enlaza en su boceto. Cargar una desde una URL u otra
 * ubicación remota puede ser bloqueado debido a la seguridad incorporada de 
 * su navegador.
 *
 * @method loadImageElement
 * @param  {String} path Ruta de la imagen a cargar
 * @param  {Function(Image)} [successCallback] Función a la que se llamará una vez
 *                                cargada la imagen. Se le pasará la
 *                                Imagen.
 * @param  {Function(Event)}    [failureCallback] llamado con error de evento si la imagen
 *                               no se carga.
 * @return {Image}               el objeto Imagen
 */
p5.prototype.loadImageElement = function(path, successCallback, failureCallback) {
  var img = new Image();
  var decrementPreload = p5._getDecrementPreload.apply(this, arguments);

  img.onload = function() {
    if (typeof successCallback === 'function') {
      successCallback(img);
    }
    if (decrementPreload && (successCallback !== decrementPreload)) {
      decrementPreload();
    }
  };
  img.onerror = function(e) {
    p5._friendlyFileLoadError(0, img.src);
    // no confundir la llamada de retorno al fracaso con decrementPreload
    if ((typeof failureCallback === 'function') &&
      (failureCallback !== decrementPreload)) {
      failureCallback(e);
    }
  };

  //Establecer crossOrigin en caso de que la imagen se sirva con cabeceras CORS,
  //esto nos permitirá dibujar en el lienzo sin mancharlo.
  //ver https://developer.mozilla.org/en-US/docs/HTML/CORS_Enabled_Image
  // Al utilizar data-uris el archivo se cargará localmente 
  // por lo que no tenemos que preocuparnos por el crossOrigin con los tipos de archivo base64
  if(path.indexOf('data:image/') !== 0) {
    img.crossOrigin = 'Anonymous';
  }

  //empezar a cargar la imagen
  img.src = path;

  return img;
};

/**
 * Dibuja un elemento de imagen en el canvas principal del boceto p5js
 *
 * @method imageElement
 * @param  {Image}    imgEl    la imagen a mostrar
 * @param  {Number}   [sx=0]   La coordenada X de la esquina superior izquierda del
 *                             sub-rectángulo de la imagen de origen para dibujar 
 *                             en el canvas de destino.
 * @param  {Number}   [sy=0]   La coordenada Y de la esquina superior izquierda del
 *                             sub-rectángulo de la imagen de origen para dibujar 
 *                             en el canvas de destino.
 * @param {Number} [sWidth=imgEl.width] La anchura del sub-rectángulo de la imagen de 
 *                                      origen para dibujar en el canvas de
 *                                      destino.
 * @param {Number} [sHeight=imgEl.height] La altura del sub-rectángulo de la imagen de 
 *                                        origen para dibujar en el canvas de
 *                                        destino.
 * @param  {Number}   [dx=0]    La coordenada X en el canvas de destino en la 
 *                              que colocar la esquina superior izquierda de la 
 *                              imagen de origen.
 * @param  {Number}   [dy=0]    La coordenada Y en el canvas de destino en la 
 *                              que colocar la esquina superior izquierda de la 
 *                              imagen de origen.
 * @param  {Number}   [dWidth]  El ancho para dibujar la imagen en el canvas de destino.
 *                              Esto permite escalar la imagen dibujada.
 * @param  {Number}   [dHeight] La altura para dibujar la imagen en el canvas de destino.
 *                              Esto permite escalar la imagen dibujada.
 * @example
 * <div>
 * <code>
 * var imgEl;
 * función preload() {
 *   imgEl = loadImageElement("assets/laDefense.jpg");
 * }
 * función setup() {
 *   imageElement(imgEl, 0, 0);
 *   imageElement(imgEl, 0, 0, 100, 100);
 *   imageElement(imgEl, 0, 0, 100, 100, 0, 0, 100, 100);
 * }
 * </code>
 * </div>
 * <div>
 * <code>
 * función setup() {
 *   // aquí utilizamos una entrada de retorno para mostrar la imagen después de cargar
 *   loadImageElement("assets/laDefense.jpg", function(imgEl) {
 *     imageElement(imgEl, 0, 0);
 *   });
 * }
 * </code>
 * </div>
 *
 * @alt
 * imagen de la parte inferior de un paraguas blanco y el techo de rejilla por encima
 * imagen de la parte inferior de un paraguas blanco y el techo de rejilla por encima
 *
 */
p5.prototype.imageElement = function(imgEl, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight) {
  /**
   * Valida los parámetros de recorte. Según las especificaciones de drawImage, sWidth y sHight no pueden ser
   * negativos o mayores que la anchura y la altura intrínsecas de la imagen.
   * @private
   * @param {Number} sVal
   * @param {Number} iVal
   * @returns {Number}
   * @private
   */
  function _sAssign(sVal, iVal) {
    if (sVal > 0 && sVal < iVal) {
      return sVal;
    }
    else {
      return iVal;
    }
  }

  function modeAdjust(a, b, c, d, mode) {
    if (mode === p5.prototype.CORNER) {
      return {x: a, y: b, w: c, h: d};
    } else if (mode === p5.prototype.CORNERS) {
      return {x: a, y: b, w: c-a, h: d-b};
    } else if (mode === p5.prototype.RADIUS) {
      return {x: a-c, y: b-d, w: 2*c, h: 2*d};
    } else if (mode === p5.prototype.CENTER) {
      return {x: a-c*0.5, y: b-d*0.5, w: c, h: d};
    }
  }

  if (arguments.length <= 5) {
    dx = sx || 0;
    dy = sy || 0;
    sx = 0;
    sy = 0;
    dWidth = sWidth || imgEl.width;
    dHeight = sHeight || imgEl.height;
    sWidth = imgEl.width;
    sHeight = imgEl.height;
  } else if (arguments.length === 9) {
    sx = sx || 0;
    sy = sy || 0;
    sWidth = _sAssign(sWidth, imgEl.width);
    sHeight = _sAssign(sHeight, imgEl.height);

    dx = dx || 0;
    dy = dy || 0;
    dWidth = dWidth || imgEl.width;
    dHeight = dHeight || imgEl.height;
  } else {
    throw 'Número incorrecto de argumentos para imageElement()';
  }

  var vals = modeAdjust(dx, dy, dWidth, dHeight,
    this._renderer._imageMode);

  if (this._renderer._tint) {
    // Crear/dibujar en un canvas temporal para que el tintado pueda
    // funcionar dentro del renderizador como lo haría para una p5.Image
    // Sólo cambiar el tamaño del canvas si es demasiado pequeño
    var context = this._tempCanvas.getContext('2d');
    if (this._tempCanvas.width < vals.w || this._tempCanvas.height < vals.h) {
      this._tempCanvas.width = Math.max(this._tempCanvas.width, vals.w);
      this._tempCanvas.height = Math.max(this._tempCanvas.height, vals.h);
    } else {
      context.clearRect(0, 0, vals.w, vals.h);
    }
    context.drawImage(imgEl,
      sx, sy, sWidth, sHeight,
      0, 0, vals.w, vals.h);
    // Seleccionar el método image() del renderizador con un objeto que contenga la imagen como propiedad
    // 'elt' y el lienzo temporal también (cuando sea necesario):
    this._renderer.image({canvas: this._tempCanvas},
      0, 0, vals.w, vals.h,
      vals.x, vals.y, vals.w, vals.h);
  } else {
    this._renderer.image({elt: imgEl},
      sx, sy, sWidth, sHeight,
      vals.x, vals.y, vals.w, vals.h);
  }
};

/**
* Un grupo que contiene todos los sprites del boceto.
*
* @property allSprites
* @for p5.play
* @type {Group}
*/

defineLazyP5Property('allSprites', function() {
  return new p5.prototype.Group();
});

p5.prototype._mouseButtonIsPressed = function(buttonCode) {
  return (this.mouseIsPressed && this.mouseButton === buttonCode) ||
    (this.touchIsDown && buttonCode === this.LEFT);
};

p5.prototype.mouseDidMove = function() {
  return this.pmouseX !== this.mouseX || this.pmouseY !== this.mouseY;
};

p5.prototype.mouseIsOver = function(sprite) {
  if (!sprite) {
    return false;
  }

  if (!sprite.collider) {
    sprite.setDefaultCollider();
  }

  var mousePosition;
  if (this.camera.active) {
    mousePosition = this.createVector(this.camera.mouseX, this.camera.mouseY);
  } else {
    mousePosition = this.createVector(this.mouseX, this.mouseY);
  }

  return sprite.collider.overlap(new window.p5.PointCollider(mousePosition));
};

p5.prototype.mousePressedOver = function(sprite) {
  return (this.mouseIsPressed || this.touchIsDown) && this.mouseIsOver(sprite);
};

var styleEmpty = 'rgba(0,0,0,0)';

p5.Renderer2D.prototype.regularPolygon = function(x, y, sides, size, rotation) {
  var ctx = this.drawingContext;
  var doFill = this._doFill, doStroke = this._doStroke;
  if (doFill && !doStroke) {
    if (ctx.fillStyle === styleEmpty) {
      return this;
    }
  } else if (!doFill && doStroke) {
    if (ctx.strokeStyle === styleEmpty) {
      return this;
    }
  }
  if (sides < 3) {
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + size * Math.cos(rotation), y + size * Math.sin(rotation));
  for (var i = 1; i < sides; i++) {
    var angle = rotation + (i * 2 * Math.PI / sides);
    ctx.lineTo(x + size * Math.cos(angle), y + size * Math.sin(angle));
  }
  ctx.closePath();
  if (doFill) {
    ctx.fill();
  }
  if (doStroke) {
    ctx.stroke();
  }
};

p5.prototype.regularPolygon = function(x, y, sides, size, rotation) {
  if (!this._renderer._doStroke && !this._renderer._doFill) {
    return this;
  }
  var args = new Array(arguments.length);
  for (var i = 0; i < args.length; ++i) {
    args[i] = arguments[i];
  }

  if (typeof rotation === 'undefined') {
    rotation = -(Math.PI / 2);
    if (0 === sides % 2) {
      rotation += Math.PI / sides;
    }
  } else if (this._angleMode === this.DEGREES) {
    rotation = this.radians(rotation);
  }

  // NOTA: sólo se implementa para los que no son 3D
  if (!this._renderer.isP3D) {
    this._validateParameters(
      'regularPolygon',
      args,
      [
        ['Number', 'Number', 'Number', 'Number'],
        ['Number', 'Number', 'Number', 'Number', 'Number']
      ]
    );
    this._renderer.regularPolygon(
      args[0],
      args[1],
      args[2],
      args[3],
      rotation
    );
  }
  return this;
};

p5.Renderer2D.prototype.shape = function() {
  var ctx = this.drawingContext;
  var doFill = this._doFill, doStroke = this._doStroke;
  if (doFill && !doStroke) {
    if (ctx.fillStyle === styleEmpty) {
      return this;
    }
  } else if (!doFill && doStroke) {
    if (ctx.strokeStyle === styleEmpty) {
      return this;
    }
  }
  var numCoords = arguments.length / 2;
  if (numCoords < 1) {
    return;
  }
  ctx.beginPath();
  ctx.moveTo(arguments[0], arguments[1]);
  for (var i = 1; i < numCoords; i++) {
    ctx.lineTo(arguments[i * 2], arguments[i * 2 + 1]);
  }
  ctx.closePath();
  if (doFill) {
    ctx.fill();
  }
  if (doStroke) {
    ctx.stroke();
  }
};

p5.prototype.shape = function() {
  if (!this._renderer._doStroke && !this._renderer._doFill) {
    return this;
  }
  // NOTA: sólo se implementa para los que no son 3D
  if (!this._renderer.isP3D) {
    // TODO: llamar a this._validateParameters, una vez que esté funcionando en p5.js
    // y entendamos si se puede usar para funciones var args como esta
    this._renderer.shape.apply(this._renderer, arguments);
  }
  return this;
};

p5.prototype.rgb = function(r, g, b, a) {
  // convertir a de 0 a 255 a 0 a 1
  if (!a) {
    a = 1;
  }
  a = a * 255;

  return this.color(r, g, b, a);
};

p5.prototype.createGroup = function() {
  return new this.Group();
};

defineLazyP5Property('World', function() {
  var World = {
    pInst: this
  };

  function createReadOnlyP5PropertyAlias(name) {
    Object.defineProperty(World, name, {
      enumerable: true,
      get: function() {
        return this.pInst[name];
      }
    });
  }

  createReadOnlyP5PropertyAlias('width');
  createReadOnlyP5PropertyAlias('height');
  createReadOnlyP5PropertyAlias('mouseX');
  createReadOnlyP5PropertyAlias('mouseY');
  createReadOnlyP5PropertyAlias('allSprites');
  createReadOnlyP5PropertyAlias('frameCount');

  Object.defineProperty(World, 'frameRate', {
    enumerable: true,
    get: function() {
      return this.pInst.frameRate();
    },
    set: function(value) {
      this.pInst.frameRate(value);
    }
  });

  Object.defineProperty(World, 'seconds', {
    enumerable: true,
    get: function() {
      var currentDate = new Date();
      var currentTime = currentDate.getTime();
      return Math.round((currentTime - this.pInst._startTime) / 1000);
    }
  });

  return World;
});

p5.prototype.spriteUpdate = true;

/**
   * Un Sprite es el principal bloque de construcción de p5.play:
   * un elemento capaz de almacenar imágenes o animaciones con un conjunto de
   * propiedades como la posición y la visibilidad.
   * Un Sprite puede tener un colisionador que define el área activa para detectar
   * colisiones o solapamientos con otros sprites e interacciones con el ratón.
   *
   * Los sprites creados mediante createSprite (la forma preferida) se añaden
   * al grupo allSprites y se les da un valor de profundidad que los coloca delante de todos
   * los demás sprites.
   *
   * @method createSprite
   * @param {Number} x Coordenada x inicial
   * @param {Number} y Coordenada y inicial 
   * @param {Number} width Ancho del rectángulo del marcador de posición y del
   *                       colisionador hasta que se establezca una imagen o un nuevo colisionador
   * @param {Number} height Altura del rectángulo del marcador de posición y del
   *                       colisionador hasta que se establezca una imagen o un nuevo colisionador
   * @return {Object} La nueva instancia de sprite
   */

p5.prototype.createSprite = function(x, y, width, height) {
  var s = new Sprite(this, x, y, width, height);
  s.depth = this.allSprites.maxDepth()+1;
  this.allSprites.add(s);
  return s;
};


/**
   * Elimina un Sprite del sketch.
   * El Sprite eliminado no se dibujará ni actualizará más.
   * Equivalente a Sprite.remove()
   *
   * @method removeSprite
   * @param {Object} sprite Sprite a eliminar
*/
p5.prototype.removeSprite = function(sprite) {
  sprite.remove();
};

/**
* Actualiza todos los sprites del sketch (posición, animación...)
* se llama automáticamente en cada draw().
* Se puede pausar pasando un parámetro true o false;
* Nota: no renderiza los sprites.
*
* @method updateSprites
* @param {Boolean} updating false para pausar la actualización, true para reanudarla
*/
p5.prototype.updateSprites = function(upd) {

  if(upd === false)
    this.spriteUpdate = false;
  if(upd === true)
    this.spriteUpdate = true;

  if(this.spriteUpdate)
  for(var i = 0; i<this.allSprites.size(); i++)
  {
    this.allSprites.get(i).update();
  }
};

/**
* Devuelve todos los sprites del sketch como un conjunto
*
* @method getSprites
* @return {Array} Conjunto de Sprites
*/
p5.prototype.getSprites = function() {

  //draw everything
  if(arguments.length===0)
  {
    return this.allSprites.toArray();
  }
  else
  {
    var arr = [];
    //for every tag
    for(var j=0; j<arguments.length; j++)
    {
      for(var i = 0; i<this.allSprites.size(); i++)
      {
        if(this.allSprites.get(i).isTagged(arguments[j]))
          arr.push(this.allSprites.get(i));
      }
    }

    return arr;
  }

};

/**
* Muestra un grupo de sprites.
* Si no se especifica ningún parámetro, dibuja todos los sprites del
* boceto.
* El orden de dibujo está determinado por la propiedad "depth" del Sprite
*
* @method drawSprites
* @param {Group} [group] Grupo de Sprites a mostrar
*/
p5.prototype.drawSprites = function(group) {
  // Si no se proporciona ningún grupo, dibuja el grupo allSprites.
  group = group || this.allSprites;

  if (typeof group.draw !== 'function')
  {
    throw('Error: con drawSprites sólo puedes dibujar todos los sprites o un grupo');
  }

  group.draw();
};

/**
* Muestra un Sprite.
* Para ser utilizado típicamente en la función principal de dibujo.
*
* @method drawSprite
* @param {Sprite} sprite Sprite a mostrar
*/
p5.prototype.drawSprite = function(sprite) {
  if(sprite)
  sprite.display();
};

/**
* Carga una animación.
* Para ser usado típicamente en la función preload() del sketch.
*
* @method loadAnimation
* @param {Sprite} sprite Sprite a mostrar
*/
p5.prototype.loadAnimation = function() {
  return construct(this.Animation, arguments);
};

/**
 * Carga una hoja de Sprite.
 * Para ser utilizado típicamente en la función preload() del sketch.
 *
 * @method loadSpriteSheet
 */
p5.prototype.loadSpriteSheet = function() {
  return construct(this.SpriteSheet, arguments);
};

/**
* Muestra una animación.
*
* @method animation
* @param {Animation} anim Animación a mostrar
* @param {Number} x Coordenada X
* @param {Number} y Coordenada Y
*
*/
p5.prototype.animation = function(anim, x, y) {
  anim.draw(x, y);
};

//variable para detectar pulsaciones instantáneas
defineLazyP5Property('_p5play', function() {
  return {
    keyStates: {},
    mouseStates: {}
  };
});

var KEY_IS_UP = 0;
var KEY_WENT_DOWN = 1;
var KEY_IS_DOWN = 2;
var KEY_WENT_UP = 3;

/**
* Detecta si se ha pulsado una tecla durante el último ciclo.
* Se puede utilizar para desencadenar eventos una vez, cuando se pulsa o se suelta una tecla.
* Ejemplo: Super Mario saltando.
*
* @method keyWentDown
* @param {Number|String} key Código o caracter clave
* @return {Boolean} Verdadero si se ha pulsado la tecla
*/
p5.prototype.keyWentDown = function(key) {
  return this._isKeyInState(key, KEY_WENT_DOWN);
};


/**
* Detecta si una tecla fue liberada durante el último ciclo.
* Se puede utilizar para desencadenar eventos una vez, cuando se pulsa o se suelta una tecla.
* Ejemplo: Disparo de nave espacial.
*
* @method keyWentUp
* @param {Number|String} key Código o caracter clave
* @return {Boolean} Verdadero si la llave fue liberada
*/
p5.prototype.keyWentUp = function(key) {
  return this._isKeyInState(key, KEY_WENT_UP);
};

/**
* Detecta si una tecla está actualmente presionada
* Como p5 keyIsDown pero acepta cadenas y códigos
*
* @method keyDown
* @param {Number|String} key Código o caracter clave
* @return {Boolean} Verdadero si la tecla está abajo
*/
p5.prototype.keyDown = function(key) {
  return this._isKeyInState(key, KEY_IS_DOWN);
};

/**
 * Detecta si una llave está en el estado dado durante el último ciclo.
 * Método de ayuda que encapsula la lógica común del estado de la tecla; puede ser preferible
 * llamar a keyDown u otros métodos directamente.
 *
 * @private
 * @method _isKeyInState
 * @param {Number|String} key Código o caracter clave
 * @param {Number} state Estado clave a comprobar
 * @return {Boolean} Verdadero si la llave está en el estado dado
 */
p5.prototype._isKeyInState = function(key, state) {
  var keyCode;
  var keyStates = this._p5play.keyStates;

  if(typeof key === 'string')
  {
    keyCode = this._keyCodeFromAlias(key);
  }
  else
  {
    keyCode = key;
  }

  //si no está definido, empezar a comprobarlo
  if(keyStates[keyCode]===undefined)
  {
    if(this.keyIsDown(keyCode))
      keyStates[keyCode] = KEY_IS_DOWN;
    else
      keyStates[keyCode] = KEY_IS_UP;
  }

  return (keyStates[keyCode] === state);
};

/**
* Detecta si un botón del ratón está actualmente presionado
* Combina mouseIsPressed y mouseButton de p5
*
* @method mouseDown
* @param {Number} [buttonCode] Botón del ratón constante IZQUIERDA, DERECHA o CENTRO
* @return {Boolean} Verdadero si el botón está abajo
*/
p5.prototype.mouseDown = function(buttonCode) {
  return this._isMouseButtonInState(buttonCode, KEY_IS_DOWN);
};

/**
* Detecta si un botón del ratón está actualmente levantado
* Combina mouseIsPressed y mouseButton de p5
*
* @method mouseUp
* @param {Number} [buttonCode] Botón del ratón constante IZQUIERDA, DERECHA o CENTRO
* @return {Boolean} Verdadero si el botón está arriba
*/
p5.prototype.mouseUp = function(buttonCode) {
  return this._isMouseButtonInState(buttonCode, KEY_IS_UP);
};

/**
 * Detecta si un botón del ratón fue liberado durante el último ciclo.
 * Se puede utilizar para desencadenar eventos una vez, para ser comprobado en el ciclo de dibujo.
 *
 * @method mouseWentUp
 * @param {Number} [buttonCode] Botón del ratón constante IZQUIERDA, DERECHA o CENTRO
 * @return {Boolean} Verdadero si se acaba de soltar el botón
 */
p5.prototype.mouseWentUp = function(buttonCode) {
  return this._isMouseButtonInState(buttonCode, KEY_WENT_UP);
};


/**
 * Detecta si se ha pulsado un botón del ratón durante el último ciclo.
 * Se puede utilizar para desencadenar eventos una vez, para ser comprobado en el ciclo de dibujo.
 *
 * @method mouseWentDown
 * @param {Number} [buttonCode] Botón del ratón constante IZQUIERDA, DERECHA o CENTRO
 * @return {Boolean} Verdadero si se acaba de pulsar el botón
 */
p5.prototype.mouseWentDown = function(buttonCode) {
  return this._isMouseButtonInState(buttonCode, KEY_WENT_DOWN);
};

/**
 * Devuelve una constante para un estado del ratón dada una cadena o una constante del botón del ratón.
 *
 * @private
 * @method _clickKeyFromString
 * @param {Number|String} [buttonCode] Constante del botón del ratón IZQUIERDA, DERECHA o CENTRO
 *   o cadena 'leftButton', 'rightButton', o 'centerButton'
 * @return {Number} Constante del botón del ratón LEFT, RIGHT o CENTER o valor de buttonCode
 */
p5.prototype._clickKeyFromString = function(buttonCode) {
  if (this.CLICK_KEY[buttonCode]) {
    return this.CLICK_KEY[buttonCode];
  } else {
    return buttonCode;
  }
};

// Mapa de cadenas a constantes para los estados del ratón.
p5.prototype.CLICK_KEY = {
  'leftButton': p5.prototype.LEFT,
  'rightButton': p5.prototype.RIGHT,
  'centerButton': p5.prototype.CENTER
};

/**
 * Detecta si un botón del ratón está en el estado dado durante el último ciclo.
 * Método auxiliar que encapsula la lógica común del estado del botón del ratón; puede ser
 * preferible llamar directamente a mouseWentUp, etc.
 *
 * @private
 * @method _isMouseButtonInState
 * @param {Number|String} [buttonCode] Constante del botón del ratón IZQUIERDA, DERECHA o CENTRO
 *   o cadena 'leftButton', 'rightButton', o 'centerButton'
 * @param {Number} state
 * @return {boolean} Verdadero si el botón estaba en el estado dado
 */
p5.prototype._isMouseButtonInState = function(buttonCode, state) {
  var mouseStates = this._p5play.mouseStates;

  buttonCode = this._clickKeyFromString(buttonCode);

  if(buttonCode === undefined)
    buttonCode = this.LEFT;

  //undefined = no se ha rastreado todavía, empieza a rastrear
  if(mouseStates[buttonCode]===undefined)
  {
  if (this._mouseButtonIsPressed(buttonCode))
    mouseStates[buttonCode] = KEY_IS_DOWN;
  else
    mouseStates[buttonCode] = KEY_IS_UP;
  }

  return (mouseStates[buttonCode] === state);
};


/**
 * Un objeto que almacena todas las claves útiles para facilitar el acceso
 * Key.tab = 9
 *
 * @private
 * @property KEY
 * @type {Object}
 */
p5.prototype.KEY = {
    'BACKSPACE': 8,
    'TAB': 9,
    'ENTER': 13,
    'SHIFT': 16,
    'CTRL': 17,
    'ALT': 18,
    'PAUSE': 19,
    'CAPS_LOCK': 20,
    'ESC': 27,
    'SPACE': 32,
    ' ': 32,
    'PAGE_UP': 33,
    'PAGE_DOWN': 34,
    'END': 35,
    'HOME': 36,
    'LEFT_ARROW': 37,
    'LEFT': 37,
    'UP_ARROW': 38,
    'UP': 38,
    'RIGHT_ARROW': 39,
    'RIGHT': 39,
    'DOWN_ARROW': 40,
    'DOWN': 40,
    'INSERT': 45,
    'DELETE': 46,
    '0': 48,
    '1': 49,
    '2': 50,
    '3': 51,
    '4': 52,
    '5': 53,
    '6': 54,
    '7': 55,
    '8': 56,
    '9': 57,
    'A': 65,
    'B': 66,
    'C': 67,
    'D': 68,
    'E': 69,
    'F': 70,
    'G': 71,
    'H': 72,
    'I': 73,
    'J': 74,
    'K': 75,
    'L': 76,
    'M': 77,
    'N': 78,
    'O': 79,
    'P': 80,
    'Q': 81,
    'R': 82,
    'S': 83,
    'T': 84,
    'U': 85,
    'V': 86,
    'W': 87,
    'X': 88,
    'Y': 89,
    'Z': 90,
    '0NUMPAD': 96,
    '1NUMPAD': 97,
    '2NUMPAD': 98,
    '3NUMPAD': 99,
    '4NUMPAD': 100,
    '5NUMPAD': 101,
    '6NUMPAD': 102,
    '7NUMPAD': 103,
    '8NUMPAD': 104,
    '9NUMPAD': 105,
    'MULTIPLY': 106,
    'PLUS': 107,
    'MINUS': 109,
    'DOT': 110,
    'SLASH1': 111,
    'F1': 112,
    'F2': 113,
    'F3': 114,
    'F4': 115,
    'F5': 116,
    'F6': 117,
    'F7': 118,
    'F8': 119,
    'F9': 120,
    'F10': 121,
    'F11': 122,
    'F12': 123,
    'EQUAL': 187,
    'COMMA': 188,
    'SLASH': 191,
    'BACKSLASH': 220
};

/**
 * Un objeto que almacena los alias de clave obsoletos, que todavía soportamos pero
 * que deberían ser asignados a alias válidos y generar advertencias.
 *
 * @private
 * @property KEY_DEPRECATIONS
 * @type {Object}
 */
p5.prototype.KEY_DEPRECATIONS = {
  'MINUT': 'MINUS',
  'COMA': 'COMMA'
};

/**
 * Dado un alias de clave de cadena (como se define en la propiedad KEY anterior), busca
 * la propiedad KEY anterior), busca y devuelve el código numérico de la clave JavaScript para esa clave.  Si se
 * pasa un alias obsoleto (como se define en la propiedad KEY_DEPRECATIONS) se asignará a un
 * código de clave válido, pero también se generará una
 * advertencia sobre el uso del alias obsoleto.
 *
 * @private
 * @method _keyCodeFromAlias
 * @param {!string} alias - un alias de clave que no distingue entre mayúsculas y minúsculas
 * @return {number|undefined} un código numérico de clave de JavaScript, o indefinido
 *          si no se encuentra ningún código de clave que coincida con el alias dado.
 */
p5.prototype._keyCodeFromAlias = function(alias) {
  alias = alias.toUpperCase();
  if (this.KEY_DEPRECATIONS[alias]) {
    this._warn('Key literal "' + alias + '" is deprecated and may be removed ' +
      'in a future version of p5.play. ' +
      'Please use "' + this.KEY_DEPRECATIONS[alias] + '" instead.');
    alias = this.KEY_DEPRECATIONS[alias];
  }
  return this.KEY[alias];
};

//pre draw: detectar keyStates
p5.prototype.readPresses = function() {
  var keyStates = this._p5play.keyStates;
  var mouseStates = this._p5play.mouseStates;

  for (var key in keyStates) {
    if(this.keyIsDown(key)) //si está abajo
    {
      if(keyStates[key] === KEY_IS_UP)//y estaba arriba
        keyStates[key] = KEY_WENT_DOWN;
      else
        keyStates[key] = KEY_IS_DOWN; //ahora está simplemente abajo
    }
    else //si está arriba
    {
      if(keyStates[key] === KEY_IS_DOWN)//y estaba arriba
        keyStates[key] = KEY_WENT_UP;
      else
        keyStates[key] = KEY_IS_UP; //ahora es simplemente abajo
    }
  }

  //mouse
  for (var btn in mouseStates) {

    if(this._mouseButtonIsPressed(btn)) //si está abajo
    {
      if(mouseStates[btn] === KEY_IS_UP)//y estaba arriba
        mouseStates[btn] = KEY_WENT_DOWN;
      else
        mouseStates[btn] = KEY_IS_DOWN; //ahora está simplemente abajo
    }
    else //si está arriba
    {
      if(mouseStates[btn] === KEY_IS_DOWN)//y estaba arriba
        mouseStates[btn] = KEY_WENT_UP;
      else
        mouseStates[btn] = KEY_IS_UP; //ahora está simplemente abajo
    }
  }

};

/**
* Activa o desactiva el quadTree.
* Un quadtree es una estructura de datos utilizada para optimizar la detección de colisiones.
* Puede mejorar el rendimiento cuando hay un gran número de Sprites que hay
* que comprobar continuamente si se solapan.
*
* p5.play creará y actualizará un quadtree automáticamente, sin embargo está
* inactivo por defecto.
*
* @method useQuadTree
* @param {Boolean} use Pasar true para activar, false para desactivar
*/
p5.prototype.useQuadTree = function(use) {

  if(this.quadTree !== undefined)
  {
    if(use === undefined)
      return this.quadTree.active;
    else if(use)
      this.quadTree.active = true;
    else
      this.quadTree.active = false;
  }
  else
    return false;
};

//el quadTree real
defineLazyP5Property('quadTree', function() {
  var quadTree = new Quadtree({
    x: 0,
    y: 0,
    width: 0,
    height: 0
  }, 4);
  quadTree.active = false;
  return quadTree;
});

/*
//delta independiente del framerate, no funciona realmente
p5.prototype.deltaTime = 1;

var now = Date.now();
var then = Date.now();
var INTERVAL_60 = 0.0166666; //60 fps

function updateDelta() {
then = now;
now = Date.now();
deltaTime = ((now - then) / 1000)/INTERVAL_60; // seconds since last frame
}
*/

/**
   * Un Sprite es el principal bloque de construcción de p5.play:
   * un elemento capaz de almacenar imágenes o animaciones con un conjunto de
   * propiedades como la posición y la visibilidad.
   * Un Sprite puede tener un colisionador que define el área activa para detectar
   * colisiones o solapamientos con otros sprites e interacciones con el ratón.
   *
   * Para crear un Sprite, utiliza
   * {{#crossLink "p5.play/createSprite:method"}}{{/crossLink}}.
   *
   * @class Sprite
   */

// Para saber por qué estos documentos no están en un bloque de comentarios de YUIDoc, consulte:
//
// https://github.com/molleindustria/p5.play/pull/67
//
// @param {Number} x Inicial Coordenada x
// @param {Number} y Inicial Coordenada y
// @param {Number} width Ancho del rectángulo del marcador de posición y 
//                       del colisionador hasta que se establezca una imagen o un nuevo colisionador
// @param {Number} height Altura del rectángulo del marcador de posición y 
//                       del colisionador hasta que se establezca una imagen o un nuevo colisionador
function Sprite(pInst, _x, _y, _w, _h) {
  var pInstBind = createPInstBinder(pInst);

  var createVector = pInstBind('createVector');
  var color = pInstBind('color');
  var print = pInstBind('print');
  var push = pInstBind('push');
  var pop = pInstBind('pop');
  var colorMode = pInstBind('colorMode');
  var tint = pInstBind('tint');
  var lerpColor = pInstBind('lerpColor');
  var noStroke = pInstBind('noStroke');
  var rectMode = pInstBind('rectMode');
  var ellipseMode = pInstBind('ellipseMode');
  var imageMode = pInstBind('imageMode');
  var translate = pInstBind('translate');
  var scale = pInstBind('scale');
  var rotate = pInstBind('rotate');
  var stroke = pInstBind('stroke');
  var strokeWeight = pInstBind('strokeWeight');
  var line = pInstBind('line');
  var noFill = pInstBind('noFill');
  var fill = pInstBind('fill');
  var textAlign = pInstBind('textAlign');
  var textSize = pInstBind('textSize');
  var text = pInstBind('text');
  var rect = pInstBind('rect');
  var cos = pInstBind('cos');
  var sin = pInstBind('sin');
  var atan2 = pInstBind('atan2');

  var quadTree = pInst.quadTree;
  var camera = pInst.camera;


  // Se trata de constantes p5 a las que nos gustaría acceder fácilmente.
  var RGB = p5.prototype.RGB;
  var CENTER = p5.prototype.CENTER;
  var LEFT = p5.prototype.LEFT;
  var BOTTOM = p5.prototype.BOTTOM;

  /**
  * La posición del sprite como un vector (x,y).
  * @property position
  * @type {p5.Vector}
  */
  this.position = createVector(_x, _y);

  /**
  * La posición del sprite al principio de la última actualización como un vector (x,y).
  * @property previousPosition
  * @type {p5.Vector}
  */
  this.previousPosition = createVector(_x, _y);

  /*
  La posición del sprite al final de la última actualización como un vector (x,y).
  Nota: esto diferirá de la posición siempre que la posición se cambie
  directamente por asignación.
  */
  this.newPosition = createVector(_x, _y);

  //Desplazamiento de la posición en la coordenada x desde la última actualización
  this.deltaX = 0;
  this.deltaY = 0;

  /**
  * La velocidad del sprite como vector (x,y)
  * La velocidad es la velocidad desglosada en sus componentes vertical y horizontal.
  *
  * @property velocity
  * @type {p5.Vector}
  */
  this.velocity = createVector(0, 0);

  /**
  * Establece un límite a la velocidad escalar del sprite independientemente de la dirección.
  * El valor sólo puede ser positivo. Si se establece en -1, no hay límite.
  *
  * @property maxSpeed
  * @type {Number}
  * @default -1
  */
  this.maxSpeed = -1;

  /**
  * Factor de fricción, reduce la velocidad del sprite.
  * La fricción debe ser cercana a 0 (por ejemplo, 0.01)
  * 0: sin fricción
  * 1: fricción total
  *
  * @property friction
  * @type {Number}
  * @default 0
  */
  this.friction = 0;

  /**
  * El colisionador actual del sprite.
  * Puede ser un Bounding Box alineado con el eje (un rectángulo no girado)
  * o un colisionador circular.
  * Si se comprueba que el sprite tiene eventos de colisión, rebote, superposición o ratón, el
  * colisionador se crea automáticamente a partir de la anchura y la altura
  * del sprite o de la dimensión de la imagen en el caso de los sprites animados
  *
  * Puedes establecer un colisionador personalizado con Sprite.setCollider
  *
  * @property collider
  * @type {Object}
  */
  this.collider = undefined;

  /**
  * Objeto que contiene información sobre la colisión/solapamiento más reciente
  * Se utiliza normalmente en combinación con las funciones
  * Sprite.overlap o Sprite.collide.
  * Las propiedades son touching.left, touching.right, touching.top,
  * touching.bottom y son verdaderas o falsas dependiendo del lado del
  * colisionador.
  *
  * @property touching
  * @type {Object}
  */
  this.touching = {};
  this.touching.left = false;
  this.touching.right = false;
  this.touching.top = false;
  this.touching.bottom = false;

  /**
  * La masa determina la transferencia de velocidad cuando los sprites rebotan
  * entre sí. Ver Sprite.bounce
  * Cuanto mayor sea la masa, menos se verá afectado el sprite por las colisiones.
  *
  * @property mass
  * @type {Number}
  * @default 1
  */
  this.mass = 1;

  /**
  * Si se establece en true el sprite no rebotará ni será desplazado por colisiones
  * Simula una masa infinita o un objeto anclado.
  *
  * @property immovable
  * @type {Boolean}
  * @default false
  */
  this.immovable = false;

  //Coeficiente de restitución - velocidad perdida en el rebote
  //0 perfectamente inelástico, 1 elástico, > 1 hiperelástico

  /**
  * Coeficiente de restitución. La velocidad que se pierde tras el rebote.
  * 1: perfectamente elástico, no se pierde energía
  * 0: perfectamente inelástico, no hay rebote
  * menos de 1: inelástico, es el más común en la naturaleza
  * mayor que 1: hiperelástico, la energía se incrementa como en un parachoques de pinball
  *
  * @property restitution
  * @type {Number}
  * @default 1
  */
  this.restitution = 1;

  /**
  * Rotación en grados del elemento visual (imagen o animación)
  * Nota: esta no es la dirección del movimiento, ver getDirection.
  *
  * @property rotation
  * @type {Number}
  * @default 0
  */
  Object.defineProperty(this, 'rotation', {
    enumerable: true,
    get: function() {
      return this._rotation;
    },
    set: function(value) {
      this._rotation = value;
      if (this.rotateToDirection) {
        this.setSpeed(this.getSpeed(), value);
      }
    }
  });

  /**
  * Variable de rotación interna (expresada en grados).
  * Nota: las llamadas externas acceden a esto a través de la propiedad de rotación anterior.
  *
  * @private
  * @property _rotation
  * @type {Number}
  * @default 0
  */
  this._rotation = 0;

  /**
  * Cambio de rotación en grados por fotograma del elemento visual (imagen o animación)
  * Nota: esta no es la dirección del movimiento, ver getDirection.
  *
  * @property rotationSpeed
  * @type {Number}
  * @default 0
  */
  this.rotationSpeed = 0;


  /**
  * Bloquea automáticamente la propiedad de rotación del elemento visual
  * (imagen o animación) a la dirección de movimiento del sprite y viceversa.
  *
  * @property rotateToDirection
  * @type {Boolean}
  * @default false
  */
  this.rotateToDirection = false;


  /**
  * Determina el orden de renderización dentro de un grupo: un sprite con
  * menor profundidad aparecerá debajo de los de mayor profundidad.
  *
  * Nota: dibujar un grupo antes de otro con drawSprites hará
  * ue sus miembros aparezcan debajo del segundo, como en el dibujo normal 
  * del canvas p5.
  *
  * @property depth
  * @type {Number}
  * @default One más que la mayor profundidad del sprite existente, al utilizar
  *          createSprite().  Al utilizar directamente new Sprite(), la profundidad se
  *         inicializará a 0 (no se recomienda).
  */
  this.depth = 0;

  /**
  * Determina la escala del sprite.
  * Ejemplo: 2 será el doble del tamaño nativo de los visuales,
  * 0.5 será la mitad. El aumento de escala puede hacer que las imágenes sean borrosas.
  *
  * @property scale
  * @type {Number}
  * @default 1
  */
  this.scale = 1;

  var dirX = 1;
  var dirY = 1;

  /**
  * La visibilidad del sprite.
  *
  * @property visible
  * @type {Boolean}
  * @default true
  */
  this.visible = true;

  /**
  * Si se establece como true el sprite rastreará el estado de su ratón.
  * las propiedades mouseIsPressed y mouseIsOver serán actualizadas.
  * Nota: se establece automáticamente a true si se establecen las funciones
  * onMouseReleased o onMousePressed.
  *
  * @property mouseActive
  * @type {Boolean}
  * @default false
  */
  this.mouseActive = false;

  /**
  * True si el ratón está en el colisionador del sprite.
  * Solo se puede leer.
  *
  * @property mouseIsOver
  * @type {Boolean}
  */
  this.mouseIsOver = false;

  /**
  * True si el ratón está en el colisionador del sprite.
  * Solo se puede leer.
  *
  * @property mouseIsPressed
  * @type {Boolean}
  */
  this.mouseIsPressed = false;

  /*
  * Ancho de la imagen actual del sprite.
  * Si no hay imágenes o animaciones, es el ancho del rectángulo del
  * rectángulo del marcador de posición.
  * Se utiliza internamente para hacer cálculos y dibujar el sprite.
  *
  * @private
  * @property _internalWidth
  * @type {Number}
  * @default 100
  */
  this._internalWidth = _w;

  /*
  * Altura de la imagen actual del sprite.
  * Si no hay imágenes o animaciones, es el ancho del rectángulo del
  * rectángulo del marcador de posición.
  * Se utiliza internamente para hacer cálculos y dibujar el sprite.
  *
  * @private
  * @property _internalHeight
  * @type {Number}
  * @default 100
  */
  this._internalHeight = _h;

  /*
   * @type {number}
   * @private
   * _horizontalStretch es el valor para escalar los sprites de animación en la dirección X
   */
  this._horizontalStretch = 1;

  /*
   * @type {number}
   * @private
   * _verticalStretch es el valor para escalar los sprites de animación en la dirección y
   */
  this._verticalStretch = 1;

  /*
   * _internalWidth y _internalHeight se utilizan para todos los cálculos de p5.play
   * pero la anchura y la altura pueden ampliarse. Por ejemplo, 
   * puedes querer que los usuarios siempre obtengan y establezcan un ancho escalado:
      Object.defineProperty(this, 'width', {
        enumerable: true,
        configurable: true,
        get: function() {
          return this._internalWidth * this.scale;
        },
        set: function(value) {
          this._internalWidth = value / this.scale;
        }
      });
   */

  /**
  * Ancho de la imagen actual del sprite.
  * Si no hay imágenes o animaciones, es el ancho del
  * rectángulo del marcador de posición.
  *
  * @property width
  * @type {Number}
  * @default 100
  */
  Object.defineProperty(this, 'width', {
    enumerable: true,
    configurable: true,
    get: function() {
      if (this._internalWidth === undefined) {
        return 100;
      } else if (this.animation && pInst._fixedSpriteAnimationFrameSizes) {
        return this._internalWidth * this._horizontalStretch;
      } else {
        return this._internalWidth;
      }
    },
    set: function(value) {
      if (this.animation && pInst._fixedSpriteAnimationFrameSizes) {
        this._horizontalStretch = value / this._internalWidth;
      } else {
        this._internalWidth = value;
      }
    }
  });

  if(_w === undefined)
    this.width = 100;
  else
    this.width = _w;

  /**
  * Altura de la imagen actual del sprite.
  * Si no hay imágenes o animaciones, es la altura del
  * rectángulo del marcador de posición.
  *
  * @property height
  * @type {Number}
  * @default 100
  */
  Object.defineProperty(this, 'height', {
    enumerable: true,
    configurable: true,
    get: function() {
      if (this._internalHeight === undefined) {
        return 100;
      } else if (this.animation && pInst._fixedSpriteAnimationFrameSizes) {
        return this._internalHeight * this._verticalStretch;
      } else {
        return this._internalHeight;
      }
    },
    set: function(value) {
      if (this.animation && pInst._fixedSpriteAnimationFrameSizes) {
        this._verticalStretch = value / this._internalHeight;
      } else {
        this._internalHeight = value;
      }
    }
  });

  if(_h === undefined)
    this.height = 100;
  else
    this.height = _h;

  /**
  * Ancho no escalado del sprite
  * Si no hay imágenes o animaciones, es el ancho del
  * rectángulo del marcador de posición.
  *
  * @property originalWidth
  * @type {Number}
  * @default 100
  */
  this.originalWidth = this._internalWidth;

  /**
  * Ancho no escalado del sprite
  * Si no hay imágenes o animaciones, es la altura del
  * rectángulo del marcador de posición.
  *
  * @property originalHeight
  * @type {Number}
  * @default 100
  */
  this.originalHeight = this._internalHeight;

  /**
   * Obtiene el ancho escalado del sprite.
   *
   * @method getScaledWidth
   * @return {Number} Scaled width
   */
  this.getScaledWidth = function() {
    return this.width * this.scale;
  };

  /**
   * Obtiene la altura escalada del sprite.
   *
   * @method getScaledHeight
   * @return {Number} Scaled height
   */
  this.getScaledHeight = function() {
    return this.height * this.scale;
  };

  /**
  * True si el sprite ha sido eliminado.
  *
  * @property removed
  * @type {Boolean}
  */
  this.removed = false;

  /**
  * Ciclos antes de la autoeliminación.
  * Configurarlo para iniciar una cuenta atrás, cada ciclo de dibujo la propiedad se
  * reduce en 1 unidad. A 0 llamará a un sprite.remove()
  * Desactivado si se establece en -1.
  *
  * @property life
  * @type {Number}
  * @default -1
  */
  this.life = -1;

  /**
  * Si se establece en true, dibuja un contorno del colisionador, la profundidad y el centro.
  *
  * @property debug
  * @type {Boolean}
  * @default false
  */
  this.debug = false;

  /**
  * Si no se establece ninguna imagen o animación, este es el color del
  * rectángulo del marcador de posición
  *
  * @property shapeColor
  * @type {color}
  */
  this.shapeColor = color(127, 127, 127);

  /**
  * Grupos a los que pertenece el sprite, incluyendo allSprites
  *
  * @property groups
  * @type {Array}
  */
  this.groups = [];

  var animations = {};

  //La etiqueta de la animación actual.
  var currentAnimation = '';

  /**
  * Referencia a la animación actual.
  *
  * @property animation
  * @type {Animation}
  */
  this.animation = undefined;

  /**
   * Colisionador de barrido orientado a lo largo del vector de velocidad actual, que se extiende
   * para cubrir las posiciones antigua y nueva del sprite.
   *
   * Las esquinas del colisionador barrido se extenderán más allá de la forma de barrido
   * real, pero debería ser suficiente para la detección en fase amplia de los
   * candidatos a colisión.
   *
   * Ten en cuenta que este colisionador no tendrá dimensiones si el sprite de origen no tiene
   * velocidad.
   */
  this._sweptCollider = undefined;

  /**
  * Posición x del sprite (alias de position.x).
  *
  * @property x
  * @type {Number}
  */
  Object.defineProperty(this, 'x', {
    enumerable: true,
    get: function() {
      return this.position.x;
    },
    set: function(value) {
      this.position.x = value;
    }
  });

  /**
  * Posición y del sprite (alias de position.y).
  *
  * @property y
  * @type {Number}
  */
  Object.defineProperty(this, 'y', {
    enumerable: true,
    get: function() {
      return this.position.y;
    },
    set: function(value) {
      this.position.y = value;
    }
  });

  /**
  * Velocidad del sprite x (alias de velocity.x).
  *
  * @property velocityX
  * @type {Number}
  */
  Object.defineProperty(this, 'velocityX', {
    enumerable: true,
    get: function() {
      return this.velocity.x;
    },
    set: function(value) {
      this.velocity.x = value;
    }
  });

  /**
  * Velocidad del sprite y (alias de velocity.y).
  *
  * @property velocityY
  * @type {Number}
  */
  Object.defineProperty(this, 'velocityY', {
    enumerable: true,
    get: function() {
      return this.velocity.y;
    },
    set: function(value) {
      this.velocity.y = value;
    }
  });

  /**
  * Tiempo de vida del sprite (alias de vida).
  *
  * @property lifetime
  * @type {Number}
  */
  Object.defineProperty(this, 'lifetime', {
    enumerable: true,
    get: function() {
      return this.life;
    },
    set: function(value) {
      this.life = value;
    }
  });

  /**
  * Rebote de los sprites (alias de la restitución).
  *
  * @property bounciness
  * @type {Number}
  */
  Object.defineProperty(this, 'bounciness', {
    enumerable: true,
    get: function() {
      return this.restitution;
    },
    set: function(value) {
      this.restitution = value;
    }
  });

  /**
  * Retraso de los fotogramas de la animación del sprite (alias de animation.frameDelay).
  *
  * @property frameDelay
  * @type {Number}
  */
  Object.defineProperty(this, 'frameDelay', {
    enumerable: true,
    get: function() {
      return this.animation && this.animation.frameDelay;
    },
    set: function(value) {
      if (this.animation) {
        this.animation.frameDelay = value;
      }
    }
  });

  /**
   * Si el sprite se está moviendo, utiliza el colisionador de barrido. En caso contrario, utiliza el 
   * colisionador real.
   */
  this._getBroadPhaseCollider = function() {
    return (this.velocity.magSq() > 0) ? this._sweptCollider : this.collider;
  };

  /**
   * Devuelve true si los dos sprites se cruzan en el fotograma actual,
   * indicando una posible colisión.
   */
  this._doSweptCollidersOverlap = function(target) {
    var displacement = this._getBroadPhaseCollider().collide(target._getBroadPhaseCollider());
    return displacement.x !== 0 || displacement.y !== 0;
  };

  /*
   * @private
   * Mantenga las propiedades de la animación sincronizadas con los cambios de la misma.
   */
  this._syncAnimationSizes = function(animations, currentAnimation) {
    if (pInst._fixedSpriteAnimationFrameSizes) {
      return;
    }
    if(animations[currentAnimation].frameChanged || this.width === undefined || this.height === undefined)
    {
      this._internalWidth = animations[currentAnimation].getWidth()*abs(this._getScaleX());
      this._internalHeight = animations[currentAnimation].getHeight()*abs(this._getScaleY());
    }
  };

  /**
  * Actualiza el sprite.
  * Se llama automáticamente al principio del ciclo de dibujo.
  *
  * @method update
  */
  this.update = function() {

    if(!this.removed)
    {
      if (this._sweptCollider && this.velocity.magSq() > 0) {
        this._sweptCollider.updateSweptColliderFromSprite(this);
      }

      //si ha habido un cambio en algún lugar después de la última actualización
      //la posición antigua es la última posición registrada en la actualización
      if(this.newPosition !== this.position)
        this.previousPosition = createVector(this.newPosition.x, this.newPosition.y);
      else
        this.previousPosition = createVector(this.position.x, this.position.y);

      this.velocity.x *= 1 - this.friction;
      this.velocity.y *= 1 - this.friction;

      if(this.maxSpeed !== -1)
        this.limitSpeed(this.maxSpeed);

      if(this.rotateToDirection && this.velocity.mag() > 0)
        this._rotation = this.getDirection();

      this.rotation += this.rotationSpeed;

      this.position.x += this.velocity.x;
      this.position.y += this.velocity.y;

      this.newPosition = createVector(this.position.x, this.position.y);

      this.deltaX = this.position.x - this.previousPosition.x;
      this.deltaY = this.position.y - this.previousPosition.y;

      //si hay una animación
      if(animations[currentAnimation])
      {
        //actualizarla
        animations[currentAnimation].update();

        this._syncAnimationSizes(animations, currentAnimation);
      }

      //se crea un colisionador ya sea manualmente con setCollider o
      //cuando compruebo que este sprite tiene colisiones o solapamientos
      if (this.collider) {
        this.collider.updateFromSprite(this);
      }

      //acciones del ratón
      if (this.mouseActive)
      {
        //si no hay colisionador configurarlo
          if(!this.collider)
            this.setDefaultCollider();

        this.mouseUpdate();
      }
      else
      {
        if (typeof(this.onMouseOver) === 'function' ||
            typeof(this.onMouseOut) === 'function' ||
            typeof(this.onMousePressed) === 'function' ||
            typeof(this.onMouseReleased) === 'function')
        {
          //si se establece una función de ratón
          //está implícito que queremos que el ratón esté activo así que
          //lo hacemos automáticamente
          this.mouseActive = true;

          //si no hay colisionador configurarlo
          if(!this.collider)
            this.setDefaultCollider();

          this.mouseUpdate();
        }
      }

      //cuenta atrás para la autodestrucción
      if (this.life>0)
        this.life--;
      if (this.life === 0)
        this.remove();
    }
  };//fin de la actualización

  /**
   * Crea un colisionador por defecto que coincide con el tamaño del
   * rectángulo del marcador de posición o el cuadro delimitador de la imagen.
   *
   * @method setDefaultCollider
   */
  this.setDefaultCollider = function() {
    if(animations[currentAnimation] && animations[currentAnimation].getWidth() === 1 && animations[currentAnimation].getHeight() === 1) {
      //la animación aún se está cargando
      return;
    }
    this.setCollider('rectangle');
  };

  /**
   * Actualiza los estados del ratón del sprite y activa los eventos del ratón:
   * onMouseOver, onMouseOut, onMousePressed, onMouseReleased
   *
   * @method mouseUpdate
   */
  this.mouseUpdate = function() {
    var mouseWasOver = this.mouseIsOver;
    var mouseWasPressed = this.mouseIsPressed;

    this.mouseIsOver = false;
    this.mouseIsPressed = false;

    //rollover
    if(this.collider) {
      var mousePosition;

      if(camera.active)
        mousePosition = createVector(camera.mouseX, camera.mouseY);
      else
        mousePosition = createVector(pInst.mouseX, pInst.mouseY);

      this.mouseIsOver = this.collider.overlap(new p5.PointCollider(mousePosition));

      //global p5 var
      if(this.mouseIsOver && (pInst.mouseIsPressed || pInst.touchIsDown))
        this.mouseIsPressed = true;

      //cambio de evento - funciones de llamada
      if(!mouseWasOver && this.mouseIsOver && this.onMouseOver !== undefined)
        if(typeof(this.onMouseOver) === 'function')
          this.onMouseOver.call(this, this);
        else
          print('Warning: onMouseOver should be a function');

      if(mouseWasOver && !this.mouseIsOver && this.onMouseOut !== undefined)
        if(typeof(this.onMouseOut) === 'function')
          this.onMouseOut.call(this, this);
        else
          print('Warning: onMouseOut should be a function');

      if(!mouseWasPressed && this.mouseIsPressed && this.onMousePressed !== undefined)
        if(typeof(this.onMousePressed) === 'function')
          this.onMousePressed.call(this, this);
        else
          print('Warning: onMousePressed should be a function');

      if(mouseWasPressed && !pInst.mouseIsPressed && !this.mouseIsPressed && this.onMouseReleased !== undefined)
        if(typeof(this.onMouseReleased) === 'function')
          this.onMouseReleased.call(this, this);
        else
          print('Warning: onMouseReleased should be a function');

    }
  };

  /**
  * Establece un colisionador para el sprite.
  *
  * En p5.play un Collider es un círculo o rectángulo
  * invisible que puede tener cualquier tamaño o posición relativa al sprite y que será
  * utilizado para detectar colisiones y solapamientos con otros sprites,
  * o con el cursor del ratón.
  *
  * Si el sprite se comprueba por colisión, rebote, superposición o eventos de ratón
  * se crea automáticamente un colisionador rectangular a partir del parámetro de anchura y altura
  * que se pasa en la creación del sprite o de la dimensión
  * de la imagen en caso de sprites animados.
  *
  * A menudo el cuadro delimitador de la imagen no es apropiado como área activa para
  * la detección de colisiones, por lo que se puede establecer un sprite circular
  * o rectangular con diferentes dimensiones y desplazamiento desde el centro del sprite.
  *
  * Hay muchas maneras de llamar a este método.  El primer argumento determina
  * el tipo de colisionador que está creando, lo que a su vez cambia los argumentos restantes.
  * Los tipos de colisionadores válidos son:
  *
  * * `point` - Un colisionador puntual sin dimensiones, sólo una posición.
  *
  *   `setCollider("point"[, offsetX, offsetY])`
  *
  * * `circle` - Un colisionador circular con un radio determinado.
  *
  *   `setCollider("circle"[, offsetX, offsetY[, radius])`
  *
  * * `rectangle` - Un alias para `aabb`, a continuación.
  *
  * * `aabb` - Un cuadro delimitador alineado con el eje - tiene anchura y altura pero no rotación.
  *
  *   `setCollider("aabb"[, offsetX, offsetY[, width, height]])`
  *
  * * `obb` - Un cuadro delimitador orientado - tiene anchura, altura y rotación.
  *
  *   `setCollider("obb"[, offsetX, offsetY[, width, height[, rotation]]])`
  *
  *
  * @method setCollider
  * @param {String} type Uno de "punto", "círculo", "rectángulo", "aabb" u "obb"
  * @param {Number} [offsetX] Posición x del colisionador desde el centro del sprite
  * @param {Number} [offsetY] Posición y del colisionador desde el centro del sprite
  * @param {Number} [width] Anchura o radio del colisionador
  * @param {Number} [height] Altura del colisionador
  * @param {Number} [rotation] Rotación del colisionador en grados
  * @throws {TypeError} si se dan parámetros no válidos.
  */
  this.setCollider = function(type, offsetX, offsetY, width, height, rotation) {
    var _type = type ? type.toLowerCase() : '';
    if (_type === 'rectangle') {
      // Asigna 'rectángulo' a AABB.  Cambia esto si quieres que sea por defecto OBB.
      _type = 'obb';
    }

    // Comprobar que los argumentos son correctos, proporcionar un mensaje de uso sensible al contexto si es incorrecto.
    if (!(_type === 'point' || _type === 'circle' || _type === 'obb' || _type === 'aabb')) {
      throw new TypeError('setCollider expects the first argument to be one of "point", "circle", "rectangle", "aabb" or "obb"');
    } else if (_type === 'point' && !(arguments.length === 1 || arguments.length === 3)) {
      throw new TypeError('Usage: setCollider("' + type + '"[, offsetX, offsetY])');
    } else if (_type === 'circle' && !(arguments.length === 1 || arguments.length === 3 || arguments.length === 4)) {
      throw new TypeError('Usage: setCollider("' + type + '"[, offsetX, offsetY[, radius]])');
    } else if (_type === 'aabb' && !(arguments.length === 1 || arguments.length === 3 || arguments.length === 5)) {
      throw new TypeError('Usage: setCollider("' + type + '"[, offsetX, offsetY[, width, height]])');
    } else if (_type === 'obb' && !(arguments.length === 1 || arguments.length === 3 || arguments.length === 5 || arguments.length === 6)) {
      throw new TypeError('Usage: setCollider("' + type + '"[, offsetX, offsetY[, width, height[, rotation]]])');
    }

    //var center = this.position;
    var offset = createVector(offsetX, offsetY);

    if (_type === 'point') {
      this.collider = p5.PointCollider.createFromSprite(this, offset);
    } else if (_type === 'circle') {
      this.collider = p5.CircleCollider.createFromSprite(this, offset, width);
    } else if (_type === 'aabb') {
      this.collider = p5.AxisAlignedBoundingBoxCollider.createFromSprite(this, offset, width, height);
    } else if (_type === 'obb') {
      this.collider = p5.OrientedBoundingBoxCollider.createFromSprite(this, offset, width, height, radians(rotation));
    }

    this._sweptCollider = new p5.OrientedBoundingBoxCollider();

    // Desactivado para Code.org, ya que la perfección parece mejor sin el quadtree:
    // quadTree.insert(this);
  };

  /**
  * Establece el reflejo horizontal del sprite.
  * Si 1 las imágenes se muestran normalmente
  * Si -1 las imágenes se voltean horizontalmente
  * Si no hay argumento, devuelve el reflejo x actual
  *
  * @method mirrorX
  * @param {Number} dir O bien 1 o bien -1
  * @return {Number} Reflejo actual si no se especifica ningún parámetro
  */
  this.mirrorX = function(dir) {
    if(dir === 1 || dir === -1)
      dirX = dir;
    else
      return dirX;
  };

  /**
  * Establece el reflejo vertical del sprite.
  * Si 1 las imágenes se muestran normalmente
  * Si -1 las imágenes se voltean verticalmente
  * Si no hay argumento, devuelve el reflejo actual en y
  *
  * @method mirrorY
  * @param {Number} dir O bien 1 o bien -1
  * @return {Number} Reflejo actual si no se especifica ningún parámetro
  */
  this.mirrorY = function(dir) {
    if(dir === 1 || dir === -1)
      dirY = dir;
    else
      return dirY;
  };

  /*
   * Devuelve el valor que el sprite debe ser escalado en la dirección X.
   * Se utiliza para calcular el renderizado y las colisiones.
   * Cuando se establece _fixedSpriteAnimationFrameSizes, el valor de la escala debe
   * incluir el estiramiento horizontal para las animaciones.
   * @private
   */
  this._getScaleX = function()
  {
    if (pInst._fixedSpriteAnimationFrameSizes) {
      return this.scale * this._horizontalStretch;
    }
    return this.scale;
  };

  /*
   * Devuelve el valor que el sprite debe ser escalado en la dirección Y.
   * Se utiliza para calcular el renderizado y las colisiones.
   * Cuando se establece _fixedSpriteAnimationFrameSizes, el valor de la escala debe
   * incluir el estiramiento horizontal para las animaciones.
   * @private
   */
  this._getScaleY = function()
  {
    if (pInst._fixedSpriteAnimationFrameSizes) {
      return this.scale * this._verticalStretch;
    }
    return this.scale;
  };

  /**
   * Gestiona el posicionamiento, la escala y la rotación del sprite
   * Se llama automáticamente, no debe ser anulado
   * @private
   * @final
   * @method display
   */
  this.display = function()
  {
    if (this.visible && !this.removed)
    {
      push();
      colorMode(RGB);

      noStroke();
      rectMode(CENTER);
      ellipseMode(CENTER);
      imageMode(CENTER);

      translate(this.position.x, this.position.y);
      if (pInst._angleMode === pInst.RADIANS) {
        rotate(radians(this.rotation));
      } else {
        rotate(this.rotation);
      }
      scale(this._getScaleX()*dirX, this._getScaleY()*dirY);
      this.draw();
      //dibujar información de depuración
      pop();


      if(this.debug)
      {
        push();
        //dibujar el punto de anclaje
        stroke(0, 255, 0);
        strokeWeight(1);
        line(this.position.x-10, this.position.y, this.position.x+10, this.position.y);
        line(this.position.x, this.position.y-10, this.position.x, this.position.y+10);
        noFill();

        //número de profundidad
        noStroke();
        fill(0, 255, 0);
        textAlign(LEFT, BOTTOM);
        textSize(16);
        text(this.depth+'', this.position.x+4, this.position.y-2);

        noFill();
        stroke(0, 255, 0);

        // Dibujar la forma de colisión
        if (this.collider === undefined) {
          this.setDefaultCollider();
        }
        if(this.collider) {
          this.collider.draw(pInst);
        }
        pop();
      }

    }
  };


  /**
  * Gestiona los visuales del sprite.
  * Se puede anular con una función de dibujo personalizada.
  * El punto 0,0 será el centro del sprite.
  * Ejemplo:
  * sprite.draw = function() { ellipse(0,0,10,10) }
  * Mostrará el sprite como un círculo.
  *
  * @method draw
  */
  this.draw = function()
  {
    if(currentAnimation !== '' && animations)
    {
      if(animations[currentAnimation]) {
        if(this.tint) {
          push();
          tint(this.tint);
        }
        animations[currentAnimation].draw(0, 0, 0);
        if(this.tint) {
          pop();
        }
      }
    }
    else
    {
      var fillColor = this.shapeColor;
      if (this.tint) {
        fillColor = lerpColor(color(fillColor), color(this.tint), 0.5);
      }
      noStroke();
      fill(fillColor);
      rect(0, 0, this._internalWidth, this._internalHeight);
    }
  };

  /**
   * Elimina el Sprite del sketch.
   * El Sprite eliminado no se dibujará ni se actualizará más.
   *
   * @method remove
   */
  this.remove = function() {
    this.removed = true;

    quadTree.removeObject(this);

    //cuando se eliminan de la "escena" también se eliminan todas las referencias en todos los grupos
    while (this.groups.length > 0) {
      this.groups[0].remove(this);
    }
  };

  /**
   * Alias para <a href='#method-remove'>remove()</a>
   *
   * @method destroy
   */
  this.destroy = this.remove;

  /**
  * Establece el vector de velocidad.
  *
  * @method setVelocity
  * @param {Number} x X component
  * @param {Number} y Y component
  */
  this.setVelocity = function(x, y) {
    this.velocity.x = x;
    this.velocity.y = y;
  };

  /**
  * Calcula la velocidad escalar.
  *
  * @method getSpeed
  * @return {Number} Scalar speed
  */
  this.getSpeed = function() {
    return this.velocity.mag();
  };

  /**
  * Calcula la dirección del movimiento en grados.
  *
  * @method getDirection
  * @return {Number} Angle in degrees
  */
  this.getDirection = function() {

    var direction = atan2(this.velocity.y, this.velocity.x);

    if(isNaN(direction))
      direction = 0;

    // A diferencia de Math.atan2, el método atan2 anterior devolverá grados si el
    // angleMode actual de p5 es DEGREES, y radianes si el angleMode de p5 es 
    // RADIANS. Este método debería devolver siempre grados (por ahora).
    // Ver https://github.com/molleindustria/p5.play/issues/94
    if (pInst._angleMode === pInst.RADIANS) {
      direction = degrees(direction);
    }

    return direction;
  };

  /**
  * Añade el sprite a un grupo existente
  *
  * @method addToGroup
  * @param {Object} group
  */
  this.addToGroup = function(group) {
    if(group instanceof Array)
      group.add(this);
    else
      print('addToGroup error: '+group+' is not a group');
  };

  /**
  * Limita la velocidad escalar.
  *
  * @method limitSpeed
  * @param {Number} max Velocidad máxima: número positivo
  */
  this.limitSpeed = function(max) {

    //actualización de la velocidad lineal
    var speed = this.getSpeed();

    if(abs(speed)>max)
    {
      //encontrar el factor de reducción
      var k = max/abs(speed);
      this.velocity.x *= k;
      this.velocity.y *= k;
    }
  };

  /**
  * Establece la velocidad y la dirección del sprite.
  * La acción sobrescribe la velocidad actual.
  * Si no se suministra la dirección, se mantiene la dirección actual.
  * Si no se suministra la dirección y no hay velocidad actual,
  * el ángulo de rotación actual utilizado para la dirección..
  *
  * @method setSpeed
  * @param {Number}  speed Velocidad escalar
  * @param {Number}  [angle] Dirección en grados
  */
  this.setSpeed = function(speed, angle) {
    var a;
    if (typeof angle === 'undefined') {
      if (this.velocity.x !== 0 || this.velocity.y !== 0) {
        a = pInst.atan2(this.velocity.y, this.velocity.x);
      } else {
        if (pInst._angleMode === pInst.RADIANS) {
          a = radians(this._rotation);
        } else {
          a = this._rotation;
        }
      }
    } else {
      if (pInst._angleMode === pInst.RADIANS) {
        a = radians(angle);
      } else {
        a = angle;
      }
    }
    this.velocity.x = cos(a)*speed;
    this.velocity.y = sin(a)*speed;
  };

  /**
   * Alias para <a href='#method-setSpeed'>setSpeed()</a>
   *
   * @method setSpeedAndDirection
   * @param {Number}  speed Scalar speed
   * @param {Number}  [angle] Direction in degrees
   */
  this.setSpeedAndDirection = this.setSpeed;

  /**
  * Alias para <a href='Animation.html#method-changeFrame'>animation.changeFrame()</a>
  *
  * @method setFrame
  * @param {Number} frame Frame number (starts from 0).
  */
  this.setFrame = function(f) {
    if (this.animation) {
      this.animation.changeFrame(f);
    }
  };

  /**
  * Alias para <a href='Animation.html#method-nextFrame'>animation.nextFrame()</a>
  *
  * @method nextFrame
  */
  this.nextFrame = function() {
    if (this.animation) {
      this.animation.nextFrame();
    }
  };

  /**
  * Alias para <a href='Animation.html#method-previousFrame'>animation.previousFrame()</a>
  *
  * @method previousFrame
  */
  this.previousFrame = function() {
    if (this.animation) {
      this.animation.previousFrame();
    }
  };

  /**
  * Alias para <a href='Animation.html#method-stop'>animation.stop()</a>
  *
  * @method pause
  */
  this.pause = function() {
    if (this.animation) {
      this.animation.stop();
    }
  };

  /**
   * Alias para <a href='Animation.html#method-play'>animation.play()</a> con lógica adicional
   *
   * Reproduce/reanuda la animación actual del sprite.
   * Si la animación se está reproduciendo, esto no tiene ningún efecto.
   * Si la animación se ha detenido en su último fotograma, esto la iniciará
   * desde el principio.
   *
   * @method play
   */
  this.play = function() {
    if (!this.animation) {
      return;
    }
    // Normalmente, esto sólo establece la bandera de 'reproducción' sin cambiar el
    // fotograma de la animación, lo que hará que la animación continúe en el siguiente update().
    // Si la animación no es en bucle y se detiene en el último fotograma, también
    // rebobinamos la animación hasta el principio.
    if (!this.animation.looping && !this.animation.playing && this.animation.getFrame() === this.animation.images.length - 1) {
      this.animation.rewind();
    }
    this.animation.play();
  };

  /**
   * Envoltura de acceso a <a href='Animation.html#prop-frameChanged'>animation.frameChanged</a>
   *
   * @method frameDidChange
   * @return {Boolean} true if the animation frame has changed
   */
  this.frameDidChange = function() {
    return this.animation ? this.animation.frameChanged : false;
  };

  /**
  * Rotar el sprite hacia una posición específica
  *
  * @method setFrame
  * @param {Number} x Coordenada horizontal a la que apuntar
  * @param {Number} y Coordenada vertical a la que apuntar
  */
  this.pointTo = function(x, y) {
    var yDelta = y - this.position.y;
    var xDelta = x - this.position.x;
    if (!isNaN(xDelta) && !isNaN(yDelta) && (xDelta !== 0 || yDelta !== 0)) {
      var radiansAngle = Math.atan2(yDelta, xDelta);
      this.rotation = 360 * radiansAngle / (2 * Math.PI);
    }
  };

  /**
  * Empuja el sprite en una dirección definida por un ángulo.
  * La fuerza se añade a la velocidad actual.
  *
  * @method addSpeed
  * @param {Number}  speed Velocidad de escalar a añadir
  * @param {Number}  angle Dirección en grados
  */
  this.addSpeed = function(speed, angle) {
    var a;
    if (pInst._angleMode === pInst.RADIANS) {
      a = radians(angle);
    } else {
      a = angle;
    }
    this.velocity.x += cos(a) * speed;
    this.velocity.y += sin(a) * speed;
  };

  /**
  * Empuja el sprite hacia un punto.
  * La fuerza se añade a la velocidad actual.
  *
  * @method attractionPoint
  * @param {Number}  magnitude Velocidad de escalar a añadir
  * @param {Number}  pointX Dirección de coordenada x
  * @param {Number}  pointY Dirección de coordenada y
  */
  this.attractionPoint = function(magnitude, pointX, pointY) {
    var angle = atan2(pointY-this.position.y, pointX-this.position.x);
    this.velocity.x += cos(angle) * magnitude;
    this.velocity.y += sin(angle) * magnitude;
  };


  /**
  * Añade una imagen al sprite.
  * Una imagen será considerada como una animación de un solo cuadro.
  * La imagen debe ser precargada en la función preload() usando p5 loadImage.
  * Las animaciones requieren una etiqueta de identificación (cadena) para cambiarlas.
  * La imagen se almacena en el sprite pero no necesariamente se muestra
  * hasta que se establezca Sprite.changeAnimation(label)
  *
  * Usos:
  * - sprite.addImage(label, image);
  * - sprite.addImage(image);
  *
  * Si sólo se pasa una imagen no se especifica ninguna etiqueta
  *
  * @method addImage
  * @param {String|p5.Image} label Etiqueta o imagen
  * @param {p5.Image} [img] Imagen
  */
  this.addImage = function()
  {
    if(typeof arguments[0] === 'string' && arguments[1] instanceof p5.Image)
      this.addAnimation(arguments[0], arguments[1]);
    else if(arguments[0] instanceof p5.Image)
      this.addAnimation('normal', arguments[0]);
    else
      throw('addImage error: allowed usages are <image> or <label>, <image>');
  };

  /**
  * Añade una animación al sprite.
  * La animación debe ser precargada en la función
  * preload() usando loadAnimation.
  * Las animaciones requieren una etiqueta de identificación (cadena) para cambiarlas.
  * Las animaciones se almacenan en el sprite pero no necesariamente se muestran
  * hasta que se llame a Sprite.changeAnimation(label).
  *
  * Uso:
  * - sprite.addAnimation(label, animation);
  *
  * Usos alternativos. Para más información sobre las secuencias de archivos, véase Animación:
  * - sprite.addAnimation(label, firstFrame, lastFrame);
  * - sprite.addAnimation(label, frame1, frame2, frame3...);
  *
  * @method addAnimation
  * @param {String} label Animation identifier
  * @param {Animation} animation The preloaded animation
  */
  this.addAnimation = function(label)
  {
    var anim;

    if(typeof label !== 'string')
    {
      print('Sprite.addAnimation error: the first argument must be a label (String)');
      return -1;
    }
    else if(arguments.length < 2)
    {
      print('addAnimation error: you must specify a label and n frame images');
      return -1;
    }
    else if(arguments[1] instanceof Animation)
    {

      var sourceAnimation = arguments[1];

      var newAnimation = sourceAnimation.clone();

      animations[label] = newAnimation;

      if(currentAnimation === '')
      {
        currentAnimation = label;
        this.animation = newAnimation;
      }

      newAnimation.isSpriteAnimation = true;

      this._internalWidth = newAnimation.getWidth()*abs(this._getScaleX());
      this._internalHeight = newAnimation.getHeight()*abs(this._getScaleY());

      return newAnimation;
    }
    else
    {
      var animFrames = [];
      for(var i=1; i<arguments.length; i++)
        animFrames.push(arguments[i]);

      anim = construct(pInst.Animation, animFrames);
      animations[label] = anim;

      if(currentAnimation === '')
      {
        currentAnimation = label;
        this.animation = anim;
      }
      anim.isSpriteAnimation = true;

      this._internalWidth = anim.getWidth()*abs(this._getScaleX());
      this._internalHeight = anim.getHeight()*abs(this._getScaleY());

      return anim;
    }

  };

  /**
  * Cambia la imagen/animación mostrada.
  * Equivalente a changeAnimation
  *
  * @method changeImage
  * @param {String} label Identificador de imagen/animación
  */
  this.changeImage = function(label) {
    this.changeAnimation(label);
  };

   /**
  * Devuelve la etiqueta de la animación actual
  *
  * @method getAnimationLabel
  * @return {String} Identificador de imagen/animación
  */
  this.getAnimationLabel = function() {
    return currentAnimation;
  };

  /**
  * Cambia la animación mostrada.
  * Vea Animación para tener más control sobre la secuencia.
  *
  * @method changeAnimation
  * @param {String} label Identificador de animación
  */
  this.changeAnimation = function(label) {
    if(!animations[label])
      print('changeAnimation error: no animation labeled '+label);
    else
    {
      currentAnimation = label;
      this.animation = animations[label];
    }
  };

  /**
  * Establece la animación de una lista en _predefinedSpriteAnimations.
  *
  * @method setAnimation
  * @private
  * @param {String} label Identificador de animación
  */
  this.setAnimation = function(animationName) {
    if (animationName === this.getAnimationLabel()) {
      return;
    }

    var animation = pInst._predefinedSpriteAnimations &&
        pInst._predefinedSpriteAnimations[animationName];
    if (typeof animation === 'undefined') {
      throw new Error('Unable to find an animation named "' + animationName +
          '".  Please make sure the animation exists.');
    }
    this.addAnimation(animationName, animation);
    this.changeAnimation(animationName);
    if (pInst._pauseSpriteAnimationsByDefault) {
      this.pause();
    }
  };

  /**
  * Comprueba si el punto dado se corresponde con un píxel
  * transparente en la imagen actual del sprite. Se puede utilizar para comprobar la colisión
  * de un punto sólo con la parte visible del sprite.
  *
  * @method overlapPixel
  * @param {Number} pointX Coordenada x del punto a comprobar
  * @param {Number} pointY Coordenada y del punto a comprobar
  * @return {Boolean} resultado Verdadero si no es transparente
  */
  this.overlapPixel = function(pointX, pointY) {
    var point = createVector(pointX, pointY);

    var img = this.animation.getFrameImage();

    //convertir punto a posición relativa img
    point.x -= this.position.x-img.width/2;
    point.y -= this.position.y-img.height/2;

    //fuera de la imagen por completo
    if(point.x<0 || point.x>img.width || point.y<0 || point.y>img.height)
      return false;
    else if(this.rotation === 0 && this.scale === 1)
    {
      //true si la opacidad es total
      var values = img.get(point.x, point.y);
      return values[3] === 255;
    }
    else
    {
      print('Error: overlapPixel doesn\'t work with scaled or rotated sprites yet');
      //la impresión fuera de pantalla se implementará en bleurch
      return false;
    }
  };

  /**
  * Comprueba si el punto dado está dentro del colisionador del sprite.
  *
  * @method overlapPoint
  * @param {Number} pointX Coordenada x del punto a comprobar
  * @param {Number} pointY Coordenada y del punto a comprobar
  * @return {Boolean} resultado Verdadero si dentro de
  */
  this.overlapPoint = function(pointX, pointY) {
    if(!this.collider)
      this.setDefaultCollider();

    if(this.collider) {
      var point = new p5.PointCollider(new p5.Vector(pointX, pointY));
      return this.collider.overlap(point);
    }
    return false;
  };


  /**
  * Comprueba si el sprite se superpone a otro sprite o a un grupo.
  * La comprobación se realiza utilizando los colisionadores. Si los colisionadores no están configurados,
  * se crearán automáticamente a partir de la caja delimitadora de la imagen/animación.
  *
  * Se puede especificar una función de devolución de llamada para realizar operaciones adicionales 
  * cuando se produzca el solapamiento.
  * Si el objetivo es un grupo, la función será llamada para cada
  * sprite que se superponga. Los parámetros de la función son respectivamente
  * el sprite actual y el sprite que colisiona.
  *
  * @example
  *     sprite.overlap(otherSprite, explosion);
  *
  *     function explosion(spriteA, spriteB) {
  *       spriteA.remove();
  *       spriteB.score++;
  *     }
  *
  * @method overlap
  * @param {Object} target Sprite o grupo para comparar con el actual
  * @param {Function} [callback] La función a llamar si el solapamiento es positivo
  * @return {Boolean} True si se superpone
  */
  this.overlap = function(target, callback) {
    return this._collideWith('overlap', target, callback);
  };

  /**
   * Alias para <a href='#method-overlap'>overlap()</a>, excepto sin un parámetro de
   * devolución de llamada.
   * La comprobación se realiza mediante los colisionadores. Si los colisionadores no están configurados,
   * se crearán automáticamente a partir del cuadro delimitador de la imagen/animación.
   *
   * Devuelve si este sprite se solapa o no con otro sprite o grupo.
   * Modifica el objeto de propiedad de contacto del sprite.
   *
   * @method isTouching
   * @param {Object} target Sprite o grupo para comparar con el actual
   * @return {Boolean} True si se toca
   */
  this.isTouching = this.overlap;

  /**
  * Comprueba si el sprite se solapa con otro sprite o con un grupo.
  * Si el solapamiento es positivo el sprite rebotará con el objetivo(s) tratado
  * como inamovible con un coeficiente de restitución de cero.
  *
  * La comprobación se realiza mediante los colisionadores. Si los colisionadores no están
  * configurados, se crearán automáticamente a partir del cuadro delimitador de la imagen/animación.
  *
  * Se puede especificar una función de devolución de llamada para realizar operaciones
  * adicionales cuando se produzca la colisión.
  * Si el objetivo es un grupo, la función será llamada para cada sprite
  * que colisione. Los parámetros de la función son respectivamente el
  * sprite actual y el sprite que colisiona.
  *
  * @example
  *     sprite.collide(otherSprite, explosion);
  *
  *     function explosion(spriteA, spriteB) {
  *       spriteA.remove();
  *       spriteB.score++;
  *     }
  *
  * @method collide
  * @param {Object} target Sprite o grupo para comparar con el actual
  * @param {Function} [callback] La función a usar si el solapamiento es positivo
  * @return {Boolean} True si se superpone
  */
  this.collide = function(target, callback) {
    return this._collideWith('collide', target, callback);
  };

  /**
  * Comprueba si el sprite se solapa con otro sprite o con un grupo.
  * Si el solapamiento es positivo, el sprite actual desplazará al
  * que colisiona a la posición más cercana no solapada.
  *
  * La comprobación se realiza mediante los colisionadores. Si los colisionadores no están 
  * configurados, se crearán automáticamente a partir del cuadro delimitador de la imagen/animación.
  *
  * Se puede especificar una función de devolución de llamada para realizar operaciones adicionales
  * cuando se produzca la colisión.
  * Si el objetivo es un grupo, la función será llamada para cada sprite
  * que colisione. Los parámetros de la función son respectivamente el
  * sprite actual y el sprite que colisiona.
  *
  * @example
  *     sprite.displace(otherSprite, explosion);
  *
  *     function explosion(spriteA, spriteB) {
  *       spriteA.remove();
  *       spriteB.score++;
  *     }
  *
  * @method displace
  * @param {Object} target Sprite o grupo para comparar con el actual
  * @param {Function} [callback] La función a llamar si el solapamiento es positivo
  * @return {Boolean} True si se superpone
  */
  this.displace = function(target, callback) {
    return this._collideWith('displace', target, callback);
  };

  /**
  * Comprueba si el sprite se superpone a otro sprite o a un grupo.
  * Si el solapamiento es positivo, los sprites rebotarán afectando a
  * las trayectorias de los demás en función de su .velocidad, .masa y .restitución
  *
  * La comprobación se realiza mediante los colisionadores. Si los colisionadores no están
  * configurados, se crearán automáticamente a partir del cuadro delimitador de la imagen/animación.
  *
  * Se puede especificar una función de devolución de llamada para realizar operaciones adicionales
  * cuando se produzca la colisión.
  * Si el objetivo es un grupo, la función será llamada para cada sprite
  * que colisione. Los parámetros de la función son
  * respectivamente el sprite actual y el sprite que colisiona.
  *
  * @example
  *     sprite.bounce(otherSprite, explosion);
  *
  *     function explosion(spriteA, spriteB) {
  *       spriteA.remove();
  *       spriteB.score++;
  *     }
  *
  * @method bounce
  * @param {Object} target Sprite o grupo para comparar con el actual
  * @param {Function} [callback] La función a la que se llama si el solapamiento es positivo
  * @return {Boolean} True si se superpone
  */
  this.bounce = function(target, callback) {
    return this._collideWith('bounce', target, callback);
  };

  /**
  * Comprueba si el sprite se solapa con otro sprite o con un grupo.
  * Si el solapamiento es positivo el sprite rebotará con el objetivo(s)
  * tratado como inamovible.
  *
  * La comprobación se realiza mediante los colisionadores. Si los colisionadores no están
  * configurados, se crearán automáticamente a partir del cuadro delimitador de la imagen/animación.
  *
  * Se puede especificar una función de devolución de llamada para realizar operaciones adicionales
  * cuando se produzca la colisión.
  * Si el objetivo es un grupo, la función será llamada para cada
  * sprite que colisione. Los parámetros de la función son respectivamente
  * el sprite actual y el sprite que colisiona.
  *
  * @example
  *     sprite.bounceOff(otherSprite, explosion);
  *
  *     function explosion(spriteA, spriteB) {
  *       spriteA.remove();
  *       spriteB.score++;
  *     }
  *
  * @method bounceOff
  * @param {Object} target Sprite o grupo para comparar con el actual
  * @param {Function} [callback] La función a la que se llama si el solapamiento es positivo
  * @return {Boolean} True si se superpone
  */
  this.bounceOff = function(target, callback) {
    return this._collideWith('bounceOff', target, callback);
  };

  /**
   * Función de detección de colisiones interna. No utilizar directamente.
   *
   * Maneja la colisión con sprites individuales o con grupos, utilizando
   * el quadtree para optimizar esto último.
   *
   * @method _collideWith
   * @private
   * @param {string} type - 'overlap', 'isTouching', 'displace', 'collide',
   *   'bounce' or 'bounceOff'
   * @param {Sprite|Group} target
   * @param {function} callback - si se ha producido una colisión (se ignora para "isTouching")
   * @return {boolean} verdadero si se ha producido una colisión
   */
  this._collideWith = function(type, target, callback) {
    this.touching.left = false;
    this.touching.right = false;
    this.touching.top = false;
    this.touching.bottom = false;

    if (this.removed) {
      return false;
    }

    var others = [];

    if (target instanceof Sprite) {
      others.push(target);
    } else if (target instanceof Array) {
      if (pInst.quadTree !== undefined && pInst.quadTree.active) {
        others = pInst.quadTree.retrieveFromGroup(this, target);
      }

      // Si el quadtree está deshabilitado -o- ningún sprites de este grupo
      // está todavía en el quadtree (porque sus colisionadores por defecto no han sido creados)
      // deberíamos simplemente comprobarlos todos.
      if (others.length === 0) {
        others = target;
      }
    } else {
      throw('Error: El solapamiento sólo puede comprobarse entre sprites o grupos');
    }

    var result = false;
    for(var i = 0; i < others.length; i++) {
      result = this._collideWithOne(type, others[i], callback) || result;
    }
    return result;
  };

  /**
   * Método de colisión auxiliar para colisionar este sprite con otro sprite.
   *
   * Tiene el efecto secundario de establecer las propiedades de this.touching a TRUE si se producen
   * colisiones.
   *
   * @method _collideWithOne
   * @private
   * @param {string} type - 'overlap', 'isTouching', 'displace', 'collide',
   *   'bounce' or 'bounceOff'
   * @param {Sprite} other
   * @param {function} callback - si se produce una colisión (se ignora para 'isTouching')
   * @return {boolean} True si se ha producido una colisión
   */
  this._collideWithOne = function(type, other, callback) {
    // No colisionar nunca con uno mismo
    if (other === this || other.removed) {
      return false;
    }

    if (this.collider === undefined) {
      this.setDefaultCollider();
    }

    if (other.collider === undefined) {
      other.setDefaultCollider();
    }

    if (!this.collider || !other.collider) {
      // No hemos podido crear un colisionador para uno de los sprites.
      // Esto suele significar que su animación aún no está disponible; lo estará pronto.
      // No colisione por ahora.
      return false;
    }

    // En realidad calcula el solapamiento de los dos colisionadores
    var displacement = this._findDisplacement(other);
    if (displacement.x === 0 && displacement.y === 0) {
      // Estos sprites no se superponen.
      return false;
    }

    if (displacement.x > 0)
      this.touching.left = true;
    if (displacement.x < 0)
      this.touching.right = true;
    if (displacement.y < 0)
      this.touching.bottom = true;
    if (displacement.y > 0)
      this.touching.top = true;

    // Aplicar el desplazamiento fuera de la colisión
    if (type === 'displace' && !other.immovable) {
      other.position.sub(displacement);
    } else if ((type === 'collide' || type === 'bounce' || type === 'bounceOff') && !this.immovable) {
      this.position.add(displacement);
      this.previousPosition = createVector(this.position.x, this.position.y);
      this.newPosition = createVector(this.position.x, this.position.y);
      this.collider.updateFromSprite(this);
    }

    // Crea comportamientos especiales para ciertos tipos de colisión anulando
    // temporalmente las propiedades de tipo y sprite.
    // Ver otro bloque cerca del final de este método que los devuelve.
    var originalType = type;
    var originalThisImmovable = this.immovable;
    var originalOtherImmovable = other.immovable;
    var originalOtherRestitution = other.restitution;
    if (originalType === 'collide') {
      type = 'bounce';
      other.immovable = true;
      other.restitution = 0;
    } else if (originalType === 'bounceOff') {
      type = 'bounce';
      other.immovable = true;
    }

    // Si se trata de una colisión "de rebote", determina las nuevas velocidades de cada sprite
    if (type === 'bounce') {
      // Sólo nos interesan las velocidades paralelas a la normal de colisión,
      // por lo que proyectamos las velocidades de nuestros sprites sobre esa normal (capturadas en
      // el vector de desplazamiento) y las utilizamos en todo el cálculo
      var thisInitialVelocity = p5.Vector.project(this.velocity, displacement);
      var otherInitialVelocity = p5.Vector.project(other.velocity, displacement);

      // Sólo nos importan los valores de masa relativos, así que si uno de los sprites
      // se considera "inamovible" trata la masa del _otro_ sprite como cero
      // para obtener los resultados correctos.
      var thisMass = this.mass;
      var otherMass = other.mass;
      if (this.immovable) {
        thisMass = 1;
        otherMass = 0;
      } else if (other.immovable) {
        thisMass = 0;
        otherMass = 1;
      }

      var combinedMass = thisMass + otherMass;
      var coefficientOfRestitution = this.restitution * other.restitution;
      var initialMomentum = p5.Vector.add(
        p5.Vector.mult(thisInitialVelocity, thisMass),
        p5.Vector.mult(otherInitialVelocity, otherMass)
      );
      var thisFinalVelocity = p5.Vector.sub(otherInitialVelocity, thisInitialVelocity)
        .mult(otherMass * coefficientOfRestitution)
        .add(initialMomentum)
        .div(combinedMass);
      var otherFinalVelocity = p5.Vector.sub(thisInitialVelocity, otherInitialVelocity)
        .mult(thisMass * coefficientOfRestitution)
        .add(initialMomentum)
        .div(combinedMass);
      // Elimina la velocidad antes y aplica la velocidad después a ambos miembros.
      this.velocity.sub(thisInitialVelocity).add(thisFinalVelocity);
      other.velocity.sub(otherInitialVelocity).add(otherFinalVelocity);
    }

    // Restaurar las propiedades del sprite ahora que se han hecho los cambios de velocidad.
    // Ver otro bloque antes de los cambios de velocidad que los establece.
    type = originalType;
    this.immovable = originalThisImmovable;
    other.immovable = originalOtherImmovable;
    other.restitution = originalOtherRestitution;

    // Finalmente, para todos los tipos de colisión excepto 'isTouching', llama a la llamada de retorno y
    // registra que la colisión ocurrió.
    if (typeof callback === 'function' && type !== 'isTouching') {
      callback.call(this, this, other);
    }
    return true;
  };

  this._findDisplacement = function(target) {
    // Multimuestra si hay tunelización:
    // Hacer detección de fase amplia. Comprobar si los colisionadores barridos se solapan.
    // En ese caso, comprueba las interpolaciones entre sus últimas posiciones y
    // sus posiciones actuales, y comprueba si hay tunelización de esa manera.
    // Utiliza el muestreo múltiple para detectar colisiones que de otra manera no se verían.
    if (this._doSweptCollidersOverlap(target)) {
      // Calcular el número de muestras que debemos tomar.
      // Queremos limitar esto para no tomar un número absurdo de muestras
      // cuando los objetos terminan a velocidades muy altas (como sucede a veces en
      // motores de juegos).
      var radiusOnVelocityAxis = Math.max(
        this.collider._getMinRadius(),
        target.collider._getMinRadius());
      var relativeVelocity = p5.Vector.sub(this.velocity, target.velocity).mag();
      var timestep = Math.max(0.015, radiusOnVelocityAxis / relativeVelocity);
      // Si los objetos son lo suficientemente pequeños como para beneficiarse del muestreo múltiple a
      // esta velocidad relativa
      if (timestep < 1) {
        // Mover los sprites a las posiciones anteriores
        // (Aquí pasamos por el aro para evitar crear demasiados
        //  objetos vectoriales nuevos)
        var thisOriginalPosition = this.position.copy();
        var targetOriginalPosition = target.position.copy();
        this.position.set(this.previousPosition);
        target.position.set(target.previousPosition);

        // Escala de los deltas a los deltas de los pasos de tiempo
        var thisDelta = p5.Vector.sub(thisOriginalPosition, this.previousPosition).mult(timestep);
        var targetDelta = p5.Vector.sub(targetOriginalPosition, target.previousPosition).mult(timestep);

        // Nota: No tenemos que comprobar la posición original, podemos suponer que
        // no es colisionable (o se habría manejado en el último fotograma).
        for (var i = timestep; i < 1; i += timestep) {
          // Adelantar los sprites en el paso de tiempo de los subfotogramas
          this.position.add(thisDelta);
          target.position.add(targetDelta);
          this.collider.updateFromSprite(this);
          target.collider.updateFromSprite(target);

          // Comprobar la colisión en la nueva posición del bastidor auxiliar
          var displacement = this.collider.collide(target.collider);
          if (displacement.x !== 0 || displacement.y !== 0) {
            // Estos sprites se superponen - tenemos un desplazamiento,
            // y un punto en el tiempo para la colisión.
            // Si alguno de los sprites es inamovible, debería volver a su posición
            // final.  En caso contrario, deja los sprites en
            // su posición interpolada cuando se produjo la colisión.
            if (this.immovable) {
              this.position.set(thisOriginalPosition);
            }

            if (target.immovable) {
              target.position.set(targetOriginalPosition);
            }

            return displacement;
          }
        }

        // Si no encontramos un desplazamiento a mitad de camino,
        // restaura los sprites a sus posiciones originales y cae
        // para hacer la comprobación de colisión en su posición final.
        this.position.set(thisOriginalPosition);
        target.position.set(targetOriginalPosition);
      }
    }

    // Asegurarse de que los colisionadores se actualizan correctamente para que coincida con sus sprites padre. 
    // Tal vez algún día no tengamos que hacer esto, pero por ahora 
    // los sprites no están garantizados para ser internamente consistentes hacemos una 
    // actualización de última hora para asegurarnos.
    this.collider.updateFromSprite(this);
    target.collider.updateFromSprite(target);

    return this.collider.collide(target.collider);
  };
} //fin de la clase Sprite

defineLazyP5Property('Sprite', boundConstructorFactory(Sprite));

/**
   * Una cámara facilita el desplazamiento y el zoom para las escenas que se extienden más allá
   * del canvas. Una cámara tiene una posición, un factor de zoom y las coordenadas del ratón 
   * relativas a la vista.
   * La cámara se crea automáticamente en el primer ciclo de dibujo.
   *
   * En términos de p5.js la cámara envuelve todo el ciclo de dibujo en una matriz de transformación
   * pero puede ser desactivada en cualquier momento durante el ciclo de dibujo
   * por ejemplo para dibujar elementos de la interfaz en una posición absoluta.
   *
   * @class Camera
   * @constructor
   * @param {Number} x Coordenada x inicial
   * @param {Number} y Coordenada y inicial
   * @param {Number} zoom magnification
   **/
function Camera(pInst, x, y, zoom) {
  /**
  * Posición de la cámara. Define el desplazamiento global del boceto.
  *
  * @property position
  * @type {p5.Vector}
  */
  this.position = pInst.createVector(x, y);

  /**
  * Posición x de la cámara. Define el desplazamiento global horizontal del boceto.
  *
  * @property x
  * @type {Number}
  */
  Object.defineProperty(this, 'x', {
    enumerable: true,
    get: function() {
      return this.position.x;
    },
    set: function(value) {
      this.position.x = value;
    }
  });

  /**
  * Posición y de la cámara. Define el desplazamiento global horizontal del boceto.
  *
  * @property y
  * @type {Number}
  */
  Object.defineProperty(this, 'y', {
    enumerable: true,
    get: function() {
      return this.position.y;
    },
    set: function(value) {
      this.position.y = value;
    }
  });

  /**
  * Zoom de la cámara. Define la escala global del boceto.
  * Una escala de 1 será el tamaño normal. Establecerla a 2 hará que todo tenga el
  * doble de tamaño. .5 hará que todo tenga la mitad de tamaño.
  *
  * @property zoom
  * @type {Number}
  */
  this.zoom = zoom;

  /**
  * MouseX traducido a la vista de la cámara.
  * Desplazar y escalar el canvas no cambiará la posición
  * de los sprites ni las variables mouseX y mouseY. Utiliza esta propiedad para leer la posición
  * del ratón si la cámara se ha movido o ha hecho zoom.
  *
  * @property mouseX
  * @type {Number}
  */
  this.mouseX = pInst.mouseX;

  /**
  * MouseY traducido a la vista de la cámara.
  * Desplazar y escalar el canvas no cambiará la posición
  * de los sprites ni las variables mouseX y mouseY. Utiliza esta propiedad para leer la posición
  * del ratón si la cámara se ha movido o ha hecho zoom.
  *
  * @property mouseY
  * @type {Number}
  */
  this.mouseY = pInst.mouseY;

  /**
  * True si la cámara está activa.
  * Propiedad de sólo lectura. Utilice los métodos Camera.on() y Camera.off()
  * para activar o desactivar la cámara.
  *
  * @property active
  * @type {Boolean}
  */
  this.active = false;

  /**
  * Comprueba si la cámara está activa.
  * Utilice los métodos Camera.on() y Camera.off() para
  * activar o desactivar la cámara.
  *
  * @method isActive
  * @return {Boolean} true si la cámara está activa
  */
  this.isActive = function() {
    return this.active;
  };

  /**
  * Activa la cámara.
  * El canvas se dibujará según la posición y la escala de
  * la cámara hasta que se active a Camera.off()
  *
  * @method on
  */
  this.on = function() {
    if(!this.active)
    {
      cameraPush.call(pInst);
      this.active = true;
    }
  };

  /**
  * Activa la cámara.
  * El canvas se dibujará según la posición y la escala de
  * la cámara hasta que se active a Camera.on()
  *
  * @method off
  */
  this.off = function() {
    if(this.active)
    {
      cameraPop.call(pInst);
      this.active = false;
    }
  };
} //fin de la clase de cámara

defineLazyP5Property('Camera', boundConstructorFactory(Camera));

//llamado pre sorteo por defecto
function cameraPush() {
  var pInst = this;
  var camera = pInst.camera;

  //incómodo pero necesario para tener la cámara en el centro del
  //canvas por defecto
  if(!camera.init && camera.position.x === 0 && camera.position.y === 0)
    {
    camera.position.x=pInst.width/2;
    camera.position.y=pInst.height/2;
    camera.init = true;
    }

  camera.mouseX = pInst.mouseX+camera.position.x-pInst.width/2;
  camera.mouseY = pInst.mouseY+camera.position.y-pInst.height/2;

  if(!camera.active)
  {
    camera.active = true;
    pInst.push();
    pInst.scale(camera.zoom);
    pInst.translate(-camera.position.x+pInst.width/2/camera.zoom, -camera.position.y+pInst.height/2/camera.zoom);
  }
}

//llamado postdraw por defecto
function cameraPop() {
  var pInst = this;

  if(pInst.camera.active)
  {
    pInst.pop();
    pInst.camera.active = false;
  }
}




/**
   * En p5.play los grupos son colecciones de sprites con un comportamiento similar.
   * Por ejemplo, un grupo puede contener todos los sprites del fondo
   * o todos los sprites que "matan" al jugador.
   *
   * Los grupos son matrices "extendidas" y heredan todas sus propiedades,
   * por ejemplo, group.length
   *
   * Como los grupos sólo contienen referencias, un sprite puede estar en varios grupos
   * y la eliminación de un grupo no afecta a los propios sprites.
   *
   * Sprite.remove() también eliminará el sprite de
   * todos los grupos a los que pertenece.
   *
   * @class Group
   * @constructor
   */
function Group() {

  //básicamente ampliando la matriz
  var array = [];

  /**
  * Obtiene el miembro en el índice i.
  *
  * @method get
  * @param {Number} i El índice del objeto a recuperar
  */
  array.get = function(i) {
    return array[i];
  };

  /**
  * Comprueba si el grupo contiene un sprite.
  *
  * @method contains
  * @param {Sprite} sprite El sprite a buscar
  * @return {Number} Índice o -1 si no se encuentra
  */
  array.contains = function(sprite) {
    return this.indexOf(sprite)>-1;
  };

  /**
   * Igual que Group.contains
   * @method indexOf
   */
  array.indexOf = function(item) {
    for (var i = 0, len = array.length; i < len; ++i) {
      if (virtEquals(item, array[i])) {
        return i;
      }
    }
    return -1;
  };

  /**
  * Añade un sprite al grupo.
  *
  * @method add
  * @param {Sprite} s El sprite a añadir
  */
  array.add = function(s) {
    if(!(s instanceof Sprite)) {
      throw('Error: sólo puedes añadir sprites a un grupo');
    }

    if (-1 === this.indexOf(s)) {
      array.push(s);
      s.groups.push(this);
    }
  };

  /**
   * Igual que group.length
   * @method size
   */
  array.size = function() {
    return array.length;
  };

  /**
  * Elimina todos los sprites del grupo
  * de la escena.
  *
  * @method removeSprites
  */
  array.removeSprites = function() {
    while (array.length > 0) {
      array[0].remove();
    }
  };

  /**
  * Elimina todas las referencias al grupo.
  * No elimina los sprites reales.
  *
  * @method clear
  */
  array.clear = function() {
    array.length = 0;
  };

  /**
  * Elimina un sprite del grupo.
  * No elimina el sprite real, sólo la afiliación (referencia).
  *
  * @method remove
  * @param {Sprite} item El sprite a eliminar
  * @return {Boolean} True si el sprite fue encontrado y eliminado
  */
  array.remove = function(item) {
    if(!(item instanceof Sprite)) {
      throw('Error: you can only remove sprites from a group');
    }

    var i, removed = false;
    for (i = array.length - 1; i >= 0; i--) {
      if (array[i] === item) {
        array.splice(i, 1);
        removed = true;
      }
    }

    if (removed) {
      for (i = item.groups.length - 1; i >= 0; i--) {
        if (item.groups[i] === this) {
          item.groups.splice(i, 1);
        }
      }
    }

    return removed;
  };

  /**
   * Devuelve una copia del grupo como array estándar.
   * @method toArray
   */
  array.toArray = function() {
    return array.slice(0);
  };

  /**
  * Devuelve la mayor profundidad de un grupo
  *
  * @method maxDepth
  * @return {Number} La profundidad del sprite dibujado en la parte superior
  */
  array.maxDepth = function() {
    if (array.length === 0) {
      return 0;
    }

    return array.reduce(function(maxDepth, sprite) {
      return Math.max(maxDepth, sprite.depth);
    }, -Infinity);
  };

  /**
  * Devuelve la profundidad más baja de un grupo
  *
  * @method minDepth
  * @return {Number} La profundidad del sprite dibujado en la parte inferior
  */
  array.minDepth = function() {
    if (array.length === 0) {
      return 99999;
    }

    return array.reduce(function(minDepth, sprite) {
      return Math.min(minDepth, sprite.depth);
    }, Infinity);
  };

  /**
  * Dibuja todos los sprites del grupo.
  *
  * @method draw
  */
  array.draw = function() {

    //ordenar por profundidad
    this.sort(function(a, b) {
      return a.depth - b.depth;
    });

    for(var i = 0; i<this.size(); i++)
    {
      this.get(i).display();
    }
  };

  //uso interno
  function virtEquals(obj, other) {
    if (obj === null || other === null) {
      return (obj === null) && (other === null);
    }
    if (typeof (obj) === 'string') {
      return obj === other;
    }
    if (typeof(obj) !== 'object') {
      return obj === other;
    }
    if (obj.equals instanceof Function) {
      return obj.equals(other);
    }
    return obj === other;
  }

  /**
   * Colisiona cada miembro del grupo contra el objetivo utilizando el tipo de colisión dado.
   * Devuelve true si se produce alguna colisión.
   * Uso interno
   *
   * @private
   * @method _groupCollide
   * @param {!string} type una de las opciones 'overlap', 'collide', 'displace', 'bounce' o 'bounceOff'
   * @param {Object} target Grupo o Sprite
   * @param {Function} [callback] en la colisión.
   * @return {boolean} True si se ha producido alguna colisión/superposición
   */
  function _groupCollide(type, target, callback) {
    var didCollide = false;
    for(var i = 0; i<this.size(); i++)
      didCollide = this.get(i)._collideWith(type, target, callback) || didCollide;
    return didCollide;
  }

  /**
  * Comprueba si el grupo se solapa con otro grupo o sprite.
  * La comprobación se realiza utilizando los colisionadores. Si los colisionadores no están configurados,
  * se crearán automáticamente a partir de la caja delimitadora de la imagen/animación.
  *
  * Se puede especificar una función de devolución de llamada para realizar operaciones adicionales 
  * cuando se produce el solapamiento.
  * La función será llamada por cada sprite que se superponga.
  * Los parámetros de la función son respectivamente el miembro
  * del grupo actual y el otro sprite pasado como parámetro.
  *
  * @example
  *     group.overlap(otherSprite, explosion);
  *
  *     function explosion(spriteA, spriteB) {
  *       spriteA.remove();
  *       spriteB.score++;
  *     }
  *
  * @method overlap
  * @param {Object} target Grupo o Sprite para comparar con el actual
  * @param {Function} [callback] La función a llamar si el solapamiento es positivo
  * @return {Boolean} True si se superpone
  */
  array.overlap = _groupCollide.bind(array, 'overlap');

  /**
   * Alias para <a href='#method-overlap'>overlap()</a>
   *
   * Devuelve si este grupo rebotará o colisionará con otro sprite o grupo.
   * Modifica el objeto de propiedad de contacto de cada sprite.
   *
   * @method isTouching
   * @param {Object} target Grupo o Sprite para comparar con el actual
   * @return {Boolean} True si se toca
   */
  array.isTouching = array.overlap;

  /**
  * Comprueba si el grupo se solapa con otro grupo o sprite.
  * Si el solapamiento es positivo, los sprites rebotarán con el objetivo(s) tratado como
  * inamovible con un coeficiente de restitución de cero.
  *
  * La comprobación se realiza mediante los colisionadores. Si los colisionadores no están configurados,
  * se crearán automáticamente a partir del cuadro delimitador de la imagen/animación.
  *
  * Se puede especificar una función de devolución de llamada para realizar operaciones adicionales
  * cuando se produce la superposición.
  * La función será llamada para cada sprite que se superponga.
  * Los parámetros de la función son, respectivamente, el
  * miembro del grupo actual y el otro sprite pasado como parámetro.
  *
  * @example
  *     group.collide(otherSprite, explosion);
  *
  *     function explosion(spriteA, spriteB) {
  *       spriteA.remove();
  *       spriteB.score++;
  *     }
  *
  * @method collide
  * @param {Object} target Grupo o Sprite para comparar con el actual
  * @param {Function} [callback] La función a llamar si el solapamiento es positivo
  * @return {Boolean} True si se superpone
  */
  array.collide = _groupCollide.bind(array, 'collide');

  /**
  * Comprueba si el grupo se solapa con otro grupo o sprite.
  * Si el solapamiento es positivo, los sprites del grupo desplazarán
  * los que colisionan a las posiciones más cercanas no solapadas.
  *
  * La comprobación se realiza mediante los colisionadores. Si los colisionadores no están configurados,
  * se crearán automáticamente a partir del cuadro delimitador de la imagen/animación.
  *
  * Se puede especificar una función de devolución de llamada para realizar operaciones adicionales cuando se produce la superposición.
  * La función será llamada para cada sprite que se superponga.
  * Los parámetros de la función son respectivamente el miembro del grupo actual y el otro sprite pasado como parámetro.
  *
  * @example
  *     group.displace(otherSprite, explosion);
  *
  *     function explosion(spriteA, spriteB) {
  *       spriteA.remove();
  *       spriteB.score++;
  *     }
  *
  * @method displace
  * @param {Object} target Grupo o Sprite para comparar con el actual
  * @param {Function} [callback] La función a llamar si el solapamiento es positivo
  * @return {Boolean} True si se superpone
  */
  array.displace = _groupCollide.bind(array, 'displace');

  /**
  * Comprueba si el grupo se solapa con otro grupo o sprite.
  * Si el solapamiento es positivo los sprites rebotarán afectando a las trayectorias de los demás en función de su .velocidad, .masa y .restitución.
  *
  * La comprobación se realiza mediante los colisionadores. Si los colisionadores no están configurados, se crearán automáticamente a partir del cuadro delimitador de la imagen/animación.
  *
  * Se puede especificar una función de devolución de llamada para realizar operaciones adicionales cuando se produzca el solapamiento.
  * La función será llamada para cada sprite que se superponga.
  * Los parámetros de la función son respectivamente el miembro del grupo actual y el otro sprite pasado como parámetro.
  *
  * @example
  *     group.bounce(otherSprite, explosion);
  *
  *     function explosion(spriteA, spriteB) {
  *       spriteA.remove();
  *       spriteB.score++;
  *     }
  *
  * @method bounce
  * @param {Object} target Group or Sprite to check against the current one
  * @param {Function} [callback] The function to be called if overlap is positive
  * @return {Boolean} True si se superpone
  */
  array.bounce = _groupCollide.bind(array, 'bounce');

  /**
  * Comprueba si el grupo se solapa con otro grupo o sprite.
  * Si el solapamiento es positivo los sprites rebotarán con el objetivo(s) tratado(s) como inamovible(s).
  *
  * La comprobación se realiza mediante los colisionadores. Si los colisionadores no están configurados, se crearán automáticamente a partir del cuadro delimitador de la imagen/animación.
  *
  * Se puede especificar una función de devolución de llamada para realizar operaciones adicionales cuando se produce la superposición.
  * La función será llamada para cada sprite que se superponga.
  * Los parámetros de la función son, respectivamente, el miembro del grupo actual y el otro sprite pasado como parámetro.
  *
  * @example
  *     group.bounceOff(otherSprite, explosion);
  *
  *     function explosion(spriteA, spriteB) {
  *       spriteA.remove();
  *       spriteB.score++;
  *     }
  *
  * @method bounceOff
  * @param {Object} target Grupo o Sprite para comparar con el actual
  * @param {Function} [callback] La función a llamar si el solapamiento es positivo
  * @return {Boolean} True si se superpone
  */
  array.bounceOff = _groupCollide.bind(array, 'bounceOff');

  array.setPropertyEach = function(propName, value) {
    for (var i = 0; i < this.length; i++) {
      this[i][propName] = value;
    }
  };

  array.callMethodEach = function(methodName) {
    // Copia todos los argumentos después del primer parámetro en methodArgs:
    var methodArgs = Array.prototype.slice.call(arguments, 1);
    // Utiliza una copia del array en caso de que el método modifique el grupo
    var elements = [].concat(this);
    for (var i = 0; i < elements.length; i++) {
      elements[i][methodName].apply(elements[i], methodArgs);
    }
  };

  array.setDepthEach = array.setPropertyEach.bind(array, 'depth');
  array.setLifetimeEach = array.setPropertyEach.bind(array, 'lifetime');
  array.setRotateToDirectionEach = array.setPropertyEach.bind(array, 'rotateToDirection');
  array.setRotationEach = array.setPropertyEach.bind(array, 'rotation');
  array.setRotationSpeedEach = array.setPropertyEach.bind(array, 'rotationSpeed');
  array.setScaleEach = array.setPropertyEach.bind(array, 'scale');
  array.setColorEach = array.setPropertyEach.bind(array, 'shapeColor');
  array.setTintEach = array.setPropertyEach.bind(array, 'tint');
  array.setVisibleEach = array.setPropertyEach.bind(array, 'visible');
  array.setVelocityXEach = array.setPropertyEach.bind(array, 'velocityX');
  array.setVelocityYEach = array.setPropertyEach.bind(array, 'velocityY');
  array.setHeightEach = array.setPropertyEach.bind(array, 'height');
  array.setWidthEach = array.setPropertyEach.bind(array, 'width');

  array.destroyEach = array.callMethodEach.bind(array, 'destroy');
  array.pointToEach = array.callMethodEach.bind(array, 'pointTo');
  array.setAnimationEach = array.callMethodEach.bind(array, 'setAnimation');
  array.setColliderEach = array.callMethodEach.bind(array, 'setCollider');
  array.setSpeedAndDirectionEach = array.callMethodEach.bind(array, 'setSpeedAndDirection');
  array.setVelocityEach = array.callMethodEach.bind(array, 'setVelocity');
  array.setMirrorXEach = array.callMethodEach.bind(array, 'mirrorX');
  array.setMirrorYEach = array.callMethodEach.bind(array, 'mirrorY');

  return array;
}

p5.prototype.Group = Group;

/**
 * Crea cuatro sprites de borde y los añade a un grupo. Cada borde está justo fuera del canvas y tiene un grosor de 100. Después de llamar a esta función, las siguientes propiedades son expuestas y pobladas con sprites:
 * leftEdge, rightEdge, topEdge, bottomEdge
 *
 * La propiedad 'edges' se rellena con un grupo que contiene esos cuatro sprites.
 *
 * Si estos sprites de aristas ya han sido creados, la función devuelve inmediatamente el grupo de aristas existente.
 *
 * @method createEdgeSprites
 * @return {Group} The edges group
 */
p5.prototype.createEdgeSprites = function() {
  if (this.edges) {
    return this.edges;
  }

  var edgeThickness = 100;

  var width = this._curElement.elt.offsetWidth;
  var height = this._curElement.elt.offsetHeight;

  this.leftEdge = this.createSprite(-edgeThickness / 2, height / 2, edgeThickness, height);
  this.rightEdge = this.createSprite(width + (edgeThickness / 2), height / 2, edgeThickness, height);
  this.topEdge = this.createSprite(width / 2, -edgeThickness / 2, width, edgeThickness);
  this.bottomEdge = this.createSprite(width / 2, height + (edgeThickness / 2), width, edgeThickness);

  this.edges = this.createGroup();
  this.edges.add(this.leftEdge);
  this.edges.add(this.rightEdge);
  this.edges.add(this.topEdge);
  this.edges.add(this.bottomEdge);

  return this.edges;
};

/**
 * Un objeto Animación contiene una serie de imágenes (p5.Image) que pueden ser mostradas secuencialmente.
 *
 * Todos los archivos deben ser imágenes png. Deben incluir el directorio de la raíz del boceto, y la extensión .png
 *
 * Un sprite puede tener múltiples animaciones etiquetadas, ver Sprite.addAnimation y Sprite.changeAnimation, sin embargo una animación puede ser usada independientemente.
 *
 * Se puede crear una animación pasando una serie de nombres de archivo, sin importar el número, o pasando el primer y el último nombre de archivo de una secuencia numerada.
 * p5.play intentará detectar el patrón de la secuencia.
 *
 * Por ejemplo, si los nombres de los archivos son
 * las imágenes "data/file0001.png" and "data/file0005.png"
 * "data/file0003.png" y "data/file0004.png" también se cargará.
 *
 * @example
 *     var sequenceAnimation;
 *     var glitch;
 *
 *     function preload() {
 *       sequenceAnimation = loadAnimation("data/walking0001.png", "data/walking0005.png");
 *       glitch = loadAnimation("data/dog.png", "data/horse.png", "data/cat.png", "data/snake.png");
 *     }
 *
 *     function setup() {
 *       createCanvas(800, 600);
 *     }
 *
 *     function draw() {
 *       background(0);
 *       animation(sequenceAnimation, 100, 100);
 *       animation(glitch, 200, 100);
 *     }
 *
 * @class Animation
 * @constructor
 * @param {String} fileName1 Primer archivo de una secuencia O primer archivo de imagen
 * @param {String} fileName2 Último archivo de una secuencia O segundo archivo de imagen
 * @param {String} [...fileNameN] Cualquier número de archivos de imagen después de los dos primeros
 */
function Animation(pInst) {
  var frameArguments = Array.prototype.slice.call(arguments, 1);
  var i;

  var CENTER = p5.prototype.CENTER;

  /**
  * Matriz de cuadros (p5.Image)
  *
  * @property images
  * @type {Array}
  */
  this.images = [];

  var frame = 0;
  var cycles = 0;
  var targetFrame = -1;

  this.offX = 0;
  this.offY = 0;

  /**
  * Retraso entre fotogramas en número de ciclos de dibujo.
  * Si se establece en 4, la velocidad de fotogramas de la animación será la velocidad de fotogramas del boceto dividida por 4 (60fps = 15fps)
  *
  * @property frameDelay
  * @type {Number}
  * @default 2
  */
  this.frameDelay = 4;

  /**
  * True si la animación se está reproduciendo actualmente.
  *
  * @property playing
  * @type {Boolean}
  * @default true
  */
  this.playing = true;

  /**
  * Visibilidad de la animación.
  *
  * @property visible
  * @type {Boolean}
  * @default true
  */
  this.visible = true;

  /**
  * Si se establece en false la animación se detendrá después de alcanzar el último fotograma
  *
  * @property looping
  * @type {Boolean}
  * @default true
  */
  this.looping = true;

  /**
  * True si el marco cambió durante el último ciclo de dibujo
  *
  * @property frameChanged
  * @type {Boolean}
  */
  this.frameChanged = false;

  //es el colisionador definido manualmente o definido
  //por el tamaño del cuadro actual
  this.imageCollider = false;


  //modo de secuencia
  if(frameArguments.length === 2 && typeof frameArguments[0] === 'string' && typeof frameArguments[1] === 'string')
  {
    var from = frameArguments[0];
    var to = frameArguments[1];

    //print("sequence mode "+from+" -> "+to);

    //asegúrese de que las extensiones están bien
    var ext1 = from.substring(from.length-4, from.length);
    if(ext1 !== '.png')
    {
      pInst.print('Animation error: you need to use .png files (filename '+from+')');
      from = -1;
    }

    var ext2 = to.substring(to.length-4, to.length);
    if(ext2 !== '.png')
    {
      pInst.print('Animation error: you need to use .png files (filename '+to+')');
      to = -1;
    }

    //las extensiones están bien
    if(from !== -1 && to !== -1)
    {
      var digits1 = 0;
      var digits2 = 0;

      //saltar la extensión trabajar hacia atrás para encontrar los números
      for (i = from.length-5; i >= 0; i--) {
        if(from.charAt(i) >= '0' && from.charAt(i) <= '9')
          digits1++;
      }

      for (i = to.length-5; i >= 0; i--) {
        if(to.charAt(i) >= '0' && to.charAt(i) <= '9')
          digits2++;
      }

      var prefix1 = from.substring(0, from.length-(4+digits1));
      var prefix2 = to.substring(0, to.length-(4+digits2) );

      // Nuestros números probablemente tienen ceros a la izquierda, lo que significa que algunos
      // navegadores (por ejemplo, PhantomJS) los interpretarán en base 8 (octal)
      // en lugar de decimal. Para solucionar esto, le diremos explícitamente a parseInt que
      // utilice una base 10 (decimal). Para más detalles sobre este tema, ver
      // http://stackoverflow.com/a/8763427/2422398.
      var number1 = parseInt(from.substring(from.length-(4+digits1), from.length-4), 10);
      var number2 = parseInt(to.substring(to.length-(4+digits2), to.length-4), 10);

      //intercambiar si se invierte
      if(number2<number1)
      {
        var t = number2;
        number2 = number1;
        number1 = t;
      }

      //dos marcos diferentes
      if(prefix1 !== prefix2 )
      {
        //print("2 separate images");
        this.images.push(pInst.loadImage(from));
        this.images.push(pInst.loadImage(to));
      }
      //mismos dígitos: caso img0001, img0002
      else
      {
        var fileName;
        if(digits1 === digits2)
        {

          //cargar todas las imágenes
          for (i = number1; i <= number2; i++) {
            // Utilice nf() para el formato numérico 'i' en cuatro dígitos
            fileName = prefix1 + pInst.nf(i, digits1) + '.png';
            this.images.push(pInst.loadImage(fileName));

          }

        }
        else //case: case img1, img2
        {
          //print("from "+prefix1+" "+number1 +" to "+number2);
          for (i = number1; i <= number2; i++) {
            // Utilice nf() para el formato numérico 'i' en cuatro dígitos
            fileName = prefix1 + i + '.png';
            this.images.push(pInst.loadImage(fileName));

          }

        }
      }

    }//end no ext error

  }//modo de finalización de la secuencia
  // Modo de hoja de Sprite
  else if (frameArguments.length === 1 && (frameArguments[0] instanceof SpriteSheet))
  {
    this.spriteSheet = frameArguments[0];
    this.images = this.spriteSheet.frames.map( function(f) {
      if (f.spriteSourceSize && f.sourceSize) {
        return Object.assign(f.frame, {
          width: f.frame.w,
          height: f.frame.h,
          sourceX: f.spriteSourceSize.x,
          sourceY: f.spriteSourceSize.y,
          sourceW: f.sourceSize.w,
          sourceH: f.sourceSize.h,
        });
      }
      return f.frame;
    });
  }
  else if(frameArguments.length !== 0)//lista arbitraria de imágenes
  {
    //print("Animation arbitrary mode");
    for (i = 0; i < frameArguments.length; i++) {
      //print("loading "+fileNames[i]);
      if(frameArguments[i] instanceof p5.Image)
        this.images.push(frameArguments[i]);
      else
        this.images.push(pInst.loadImage(frameArguments[i]));
    }
  }

  /**
  * Los objetos se pasan por referencia así que para tener diferentes sprites usando la misma animación necesitas clonarla.
  *
  * @method clone
  * @return {Animation} Un clon de la animación actual
  */
  this.clone = function() {
    var myClone = new Animation(pInst); //empty
    myClone.images = [];

    if (this.spriteSheet) {
      myClone.spriteSheet = this.spriteSheet.clone();
    }
    myClone.images = this.images.slice();

    myClone.offX = this.offX;
    myClone.offY = this.offY;
    myClone.frameDelay = this.frameDelay;
    myClone.playing = this.playing;
    myClone.looping = this.looping;

    return myClone;
  };

  /**
   * Dibuja la animación en las coordenadas x e y.
   * Actualiza los cuadros automáticamente.
   *
   * @method draw
   * @param {Number} x coordenada x
   * @param {Number} y coordenada y
   * @param {Number} [r=0] rotación
   */
  this.draw = function(x, y, r) {
    this.xpos = x;
    this.ypos = y;
    this.rotation = r || 0;

    if (this.visible)
    {

      //única conexión con la clase de sprites
      //si la animación se utiliza de forma independiente el dibujo y la actualización son los mismos
      if(!this.isSpriteAnimation)
        this.update();

      //this.currentImageMode = g.imageMode;
      pInst.push();
      pInst.imageMode(CENTER);

      var xTranslate = this.xpos;
      var yTranslate = this.ypos;
      var image = this.images[frame];
      var frame_info = this.spriteSheet && image;

      // Ajustar la traducción si se trata de una hoja de sprites empaquetada con texturas
      // (con sourceW, sourceH, sourceX, sourceY props en nuestro array de imágenes)
      if (frame_info) {
        var missingX = (frame_info.sourceW || frame_info.width) - frame_info.width;
        var missingY = (frame_info.sourceH || frame_info.height) - frame_info.height;
        // Si el recuento de los píxeles que faltan (transparentes) no está igualmente equilibrado en
        // la izquierda frente a la derecha o arriba frente a abajo, ajustamos la traslación:
        xTranslate += ((frame_info.sourceX || 0) - missingX / 2);
        yTranslate += ((frame_info.sourceY || 0) - missingY / 2);
      }

      pInst.translate(xTranslate, yTranslate);
      if (pInst._angleMode === pInst.RADIANS) {
        pInst.rotate(radians(this.rotation));
      } else {
        pInst.rotate(this.rotation);
      }

      if (frame_info) {
        if (this.spriteSheet.image instanceof Image) {
          pInst.imageElement(this.spriteSheet.image,
            frame_info.x, frame_info.y,
            frame_info.width, frame_info.height,
            this.offX, this.offY,
            frame_info.width, frame_info.height);
        } else {
          pInst.image(this.spriteSheet.image,
            frame_info.x, frame_info.y,
            frame_info.width, frame_info.height,
            this.offX, this.offY,
            frame_info.width, frame_info.height);
          }
      } else if (image) {
        if (image instanceof Image) {
          pInst.imageElement(image, this.offX, this.offY);
        } else {
          pInst.image(image, this.offX, this.offY);
        }
      } else {
        pInst.print('Warning undefined frame '+frame);
        //this.isActive = false;
      }

      pInst.pop();
    }
  };

  //llamado por sorteo
  this.update = function() {
    cycles++;
    var previousFrame = frame;
    this.frameChanged = false;


    //ir al marco
    if(this.images.length === 1)
    {
      this.playing = false;
      frame = 0;
    }

    if ( this.playing && cycles%this.frameDelay === 0)
    {
      //ir al marco del objetivo arriba
      if(targetFrame>frame && targetFrame !== -1)
      {
        frame++;
      }
      //ir al marco de destino hacia abajo
      else if(targetFrame<frame && targetFrame !== -1)
      {
        frame--;
      }
      else if(targetFrame === frame && targetFrame !== -1)
      {
        this.playing=false;
      }
      else if (this.looping) //marco de avance
      {
        //si la siguiente trama es demasiado alta
        if (frame>=this.images.length-1)
          frame = 0;
        else
          frame++;
      } else
      {
        //si la siguiente trama es demasiado alta
        if (frame<this.images.length-1)
          frame++;
        else
          this.playing = false;
      }
    }

    if(previousFrame !== frame)
      this.frameChanged = true;

  };//fin de la actualización

  /**
  * Reproduce la animación.
  *
  * @method play
  */
  this.play = function() {
    this.playing = true;
    targetFrame = -1;
  };

  /**
  * Detiene la animación.
  *
  * @method stop
  */
  this.stop = function(){
    this.playing = false;
  };

  /**
  * Rebobina la animación al primer fotograma.
  *
  * @method rewind
  */
  this.rewind = function() {
    frame = 0;
  };

  /**
  * Cambia el marco actual.
  *
  * @method changeFrame
  * @param {Number} frame Número de fotograma (empieza por 0).
  */
  this.changeFrame = function(f) {
    if (f<this.images.length)
      frame = f;
    else
      frame = this.images.length - 1;

    targetFrame = -1;
    //this.playing = false;
  };

  /**
   * Pasa al siguiente cuadro y se detiene.
   *
   * @method nextFrame
   */
  this.nextFrame = function() {

    if (frame<this.images.length-1)
      frame = frame+1;
    else if(this.looping)
      frame = 0;

    targetFrame = -1;
    this.playing = false;
  };

  /**
   * Va al cuadro anterior y se detiene.
   *
   * @method previousFrame
   */
  this.previousFrame = function() {

    if (frame>0)
      frame = frame-1;
    else if(this.looping)
      frame = this.images.length-1;

    targetFrame = -1;
    this.playing = false;
  };

  /**
  * Reproduce la animación hacia delante o hacia atrás hacia un fotograma objetivo.
  *
  * @method goToFrame
  * @param {Number} toFrame Número de trama de destino (empieza por 0)
  */
  this.goToFrame = function(toFrame) {
    if(toFrame < 0 || toFrame >= this.images.length) {
      return;
    }

    // targetFrame es utilizado por el método update() para decidir qué fotograma seleccionar a continuación.  Cuando no se utiliza se pone a -1.
    targetFrame = toFrame;

    if(targetFrame !== frame) {
      this.playing = true;
    }
  };

  /**
  * Devuelve el número de fotograma actual.
  *
  * @method getFrame
  * @return {Number} Fotograma actual (comienza en 0)
  */
  this.getFrame = function() {
    return frame;
  };

  /**
  * Devuelve el número del último fotograma.
  *
  * @method getLastFrame
  * @return {Number} Número del último fotograma (empieza por 0)
  */
  this.getLastFrame = function() {
    return this.images.length-1;
  };

  /**
  * Devuelve la imagen del cuadro actual como p5.Image.
  *
  * @method getFrameImage
  * @return {p5.Image} Current frame image
  */
  this.getFrameImage = function() {
    return this.images[frame];
  };

  /**
  * Devuelve la imagen del fotograma en el número de fotograma especificado.
  *
  * @method getImageAt
  * @param {Number} frame Número de marco
  * @return {p5.Image} Imagen del marco
  */
  this.getImageAt = function(f) {
    return this.images[f];
  };

  /**
  * Devuelve la anchura actual del cuadro en píxeles.
  * Si no hay ninguna imagen cargada, devuelve 1.
  *
  * @method getWidth
  * @return {Number} Ancho del marco
  */
  this.getWidth = function() {
    if (this.images[frame]) {
      return this.images[frame].sourceW || this.images[frame].width;
    } else {
      return 1;
    }
  };

  /**
  * Devuelve la altura actual del cuadro en píxeles.
  * Si no hay ninguna imagen cargada, devuelve 1.
  *
  * @method getHeight
  * @return {Number} Frame height
  */
  this.getHeight = function() {
    if (this.images[frame]) {
      return this.images[frame].sourceH || this.images[frame].height;
    } else {
      return 1;
    }
  };

}

defineLazyP5Property('Animation', boundConstructorFactory(Animation));

/**
 * Representa una hoja de sprites y todos sus fotogramas.  Para ser utilizado con Animación, o con cuadros individuales de dibujo estático.
 *
 *  Hay dos maneras diferentes de cargar un SpriteSheet
 *
 * 1. Dada la anchura, la altura que se utilizará para cada fotograma y el número de fotogramas a recorrer. La hoja de sprites debe tener una cuadrícula uniforme con filas y columnas consistentes.
 *
 * 2. Dado un conjunto de objetos frame que definen la posición y las dimensiones de cada frame.  Esto es Flexible porque puedes usar hojas de sprites que no tienen filas y columnas uniformes.
 *
 * @example
 *     // Método 1 - Utilizando la anchura, la altura de cada cuadro y el número de cuadros
 *     explode_sprite_sheet = loadSpriteSheet('assets/explode_sprite_sheet.png', 171, 158, 11);
 *
 *     // Método 2 - Utilizar una matriz de objetos que definan cada cuadro
 *     var player_frames = loadJSON('assets/tiles.json');
 *     player_sprite_sheet = loadSpriteSheet('assets/player_spritesheet.png', player_frames);
 *
 * @class SpriteSheet
 * @constructor
 * @param image Ruta de la imagen o objeto p5.Image
 */
function SpriteSheet(pInst) {
  var spriteSheetArgs = Array.prototype.slice.call(arguments, 1);

  this.image = null;
  this.frames = [];
  this.frame_width = 0;
  this.frame_height = 0;
  this.num_frames = 0;

  /**
   * Generar los datos de los fotogramas de esta hoja de sprites en función de los parámetros del usuario
   * @private
   * @method _generateSheetFrames
   */
  this._generateSheetFrames = function() {
    var sX = 0, sY = 0;
    for (var i = 0; i < this.num_frames; i++) {
      this.frames.push(
        {
          'name': i,
          'frame': {
            'x': sX,
            'y': sY,
            'width': this.frame_width,
            'height': this.frame_height
          }
        });
      sX += this.frame_width;
      if (sX >= this.image.width) {
        sX = 0;
        sY += this.frame_height;
        if (sY >= this.image.height) {
          sY = 0;
        }
      }
    }
  };

  var shortArgs = spriteSheetArgs.length === 2 || spriteSheetArgs.length === 3;
  var longArgs = spriteSheetArgs.length === 4 || spriteSheetArgs.length === 5;

  if (shortArgs && Array.isArray(spriteSheetArgs[1])) {
    this.frames = spriteSheetArgs[1];
    this.num_frames = this.frames.length;
  } else if (longArgs &&
    (typeof spriteSheetArgs[1] === 'number') &&
    (typeof spriteSheetArgs[2] === 'number') &&
    (typeof spriteSheetArgs[3] === 'number')) {
    this.frame_width = spriteSheetArgs[1];
    this.frame_height = spriteSheetArgs[2];
    this.num_frames = spriteSheetArgs[3];
  }

  if(spriteSheetArgs[0] instanceof p5.Image || spriteSheetArgs[0] instanceof Image) {
    this.image = spriteSheetArgs[0];
    if (longArgs) {
      this._generateSheetFrames();
    }
  } else {
    // Cuando el argumento final está presente (ya sea el 3º o el 5º), indica si debemos 
    // cargar la URL como un elemento Image (a diferencia del comportamiento
    // por defecto, que es cargarla como un p5.Image). Si ese argumento es una función, será llamada una vez que la carga
    // tenga éxito o falle. En caso de éxito, la imagen será suministrada como único
    // parámetro. Si falla, se suministrará null.
    var callback;
    if (shortArgs) {
      if (spriteSheetArgs[2]) {
        if (typeof spriteSheetArgs[2] === 'function') {
          callback = spriteSheetArgs[2];
        }
        this.image = pInst.loadImageElement(
          spriteSheetArgs[0],
          function(img) { if (callback) return callback(img); },
          function() { if (callback) return callback(null); }
        );
      } else {
        this.image = pInst.loadImage(spriteSheetArgs[0]);
      }
    } else if (longArgs) {
      var generateSheetFrames = this._generateSheetFrames.bind(this);
      if (spriteSheetArgs[4]) {
        if (typeof spriteSheetArgs[4] === 'function') {
          callback = spriteSheetArgs[4];
        }
        this.image = pInst.loadImageElement(
          spriteSheetArgs[0],
          function(img) {
            generateSheetFrames(img);
            if (callback) return callback(img);
          },
          function() { if (callback) return callback(null); }
        );
      } else {
        this.image = pInst.loadImage(spriteSheetArgs[0], generateSheetFrames);
      }
    }
  }

  /**
   * Dibuja un marco específico en el canvas.
   * @param frame_name  Puede ser un nombre de cadena o un índice numérico.
   * @param x   posición x para dibujar el marco en
   * @param y   posición y para dibujar el marco en
   * @param [width]   ancho opcional para dibujar el marco
   * @param [height]  altura opcional para dibujar el marco
   * @method drawFrame
   */
  this.drawFrame = function(frame_name, x, y, width, height) {
    var frameToDraw;
    if (typeof frame_name === 'number') {
      frameToDraw = this.frames[frame_name];
    } else {
      for (var i = 0; i < this.frames.length; i++) {
        if (this.frames[i].name === frame_name) {
          frameToDraw = this.frames[i];
          break;
        }
      }
    }
    var frameWidth = frameToDraw.frame.width || frameToDraw.frame.w;
    var frameHeight = frameToDraw.frame.height || frameToDraw.frame.h;
    var dWidth = width || frameWidth;
    var dHeight = height || frameHeight;

    // Ajustar la forma de dibujar si se trata de una hoja de sprites empaquetada con textura (en particular, tratamos los parámetros de anchura y altura suministrados como una intención de escalar frente al sourceSize [antes de empaquetar])
    if (frameToDraw.spriteSourceSize && frameToDraw.sourceSize) {
      var frameSizeScaleX = frameWidth / frameToDraw.sourceSize.w;
      var frameSizeScaleY = frameHeight / frameToDraw.sourceSize.h;
      if (width) {
        x += (frameToDraw.spriteSourceSize.x * dWidth / frameToDraw.sourceSize.w);
        dWidth = width * frameSizeScaleX;
      } else {
        x += frameToDraw.spriteSourceSize.x;
      }
      if (height) {
        y += (frameToDraw.spriteSourceSize.y * dHeight / frameToDraw.sourceSize.h);
        dHeight = height * frameSizeScaleY;
      } else {
        y += frameToDraw.spriteSourceSize.y;
      }
    }
    if (this.image instanceof Image) {
      pInst.imageElement(this.image, frameToDraw.frame.x, frameToDraw.frame.y,
        frameToDraw.frame.width, frameToDraw.frame.height, x, y, dWidth, dHeight);
    } else {
      pInst.image(this.image, frameToDraw.frame.x, frameToDraw.frame.y,
        frameToDraw.frame.width, frameToDraw.frame.height, x, y, dWidth, dHeight);
    }
  };

  /**
   * Los objetos se pasan por referencia así que para tener diferentes sprites usando la misma animación necesitas clonarla.
   *
   * @method clone
   * @return {SpriteSheet} Un clon de la SpriteSheet actual
   */
  this.clone = function() {
    var myClone = new SpriteSheet(pInst); //vacío

    // Clonar en profundidad los cuadros por valor, no por referencia
    for(var i = 0; i < this.frames.length; i++) {
      var frame = this.frames[i].frame;
      var cloneFrame = {
        'name':frame.name,
        'frame': {
          'x':frame.x,
          'y':frame.y,
          'width':frame.width,
          'height':frame.height
        }
      };
      myClone.frames.push(cloneFrame);
    }

    // clonar otros campos
    myClone.image = this.image;
    myClone.frame_width = this.frame_width;
    myClone.frame_height = this.frame_height;
    myClone.num_frames = this.num_frames;

    return myClone;
  };
}

defineLazyP5Property('SpriteSheet', boundConstructorFactory(SpriteSheet));

//constructor general para poder alimentar los argumentos como array
function construct(constructor, args) {
  function F() {
    return constructor.apply(this, args);
  }
  F.prototype = constructor.prototype;
  return new F();
}





/*
 * Javascript Quadtree
 * basado en
 * https://github.com/timohausmann/quadtree-js/
 * Copyright © 2012 Timo Hausmann
*/

function Quadtree( bounds, max_objects, max_levels, level ) {

  this.active = true;
  this.max_objects	= max_objects || 10;
  this.max_levels		= max_levels || 4;

  this.level 			= level || 0;
  this.bounds 		= bounds;

  this.objects 		= [];
  this.object_refs	= [];
  this.nodes 			= [];
}

Quadtree.prototype.updateBounds = function() {

  //encontrar el área máxima
  var objects = this.getAll();
  var x = 10000;
  var y = 10000;
  var w = -10000;
  var h = -10000;

  for( var i=0; i < objects.length; i++ )
    {
      if(objects[i].position.x < x)
        x = objects[i].position.x;
      if(objects[i].position.y < y)
        y = objects[i].position.y;
      if(objects[i].position.x > w)
        w = objects[i].position.x;
      if(objects[i].position.y > h)
        h = objects[i].position.y;
    }


  this.bounds = {
    x:x,
    y:y,
    width:w,
    height:h
  };
  //print(this.bounds);
};

/*
	 * Dividir el nodo en 4 subnodos
	 */
Quadtree.prototype.split = function() {

  var nextLevel	= this.level + 1,
      subWidth	= Math.round( this.bounds.width / 2 ),
      subHeight 	= Math.round( this.bounds.height / 2 ),
      x 			= Math.round( this.bounds.x ),
      y 			= Math.round( this.bounds.y );

  //nodo superior derecho
  this.nodes[0] = new Quadtree({
    x	: x + subWidth,
    y	: y,
    width	: subWidth,
    height	: subHeight
  }, this.max_objects, this.max_levels, nextLevel);

  //nodo superior izquierdo
  this.nodes[1] = new Quadtree({
    x	: x,
    y	: y,
    width	: subWidth,
    height	: subHeight
  }, this.max_objects, this.max_levels, nextLevel);

  //nodo inferior izquierdo
  this.nodes[2] = new Quadtree({
    x	: x,
    y	: y + subHeight,
    width	: subWidth,
    height	: subHeight
  }, this.max_objects, this.max_levels, nextLevel);

  //nodo inferior derecho
  this.nodes[3] = new Quadtree({
    x	: x + subWidth,
    y	: y + subHeight,
    width	: subWidth,
    height	: subHeight
  }, this.max_objects, this.max_levels, nextLevel);
};


/*
	 * Determinar la cuadratura de un área en este nodo
	 */
Quadtree.prototype.getIndex = function( pRect ) {
  if(!pRect.collider)
    return -1;
  else
  {
    var colliderBounds = pRect.collider.getBoundingBox();
    var index 				= -1,
        verticalMidpoint 	= this.bounds.x + (this.bounds.width / 2),
        horizontalMidpoint 	= this.bounds.y + (this.bounds.height / 2),

        //pRect puede caber completamente dentro de los cuadrantes superiores
        topQuadrant = (colliderBounds.top < horizontalMidpoint && colliderBounds.bottom < horizontalMidpoint),

        //pRect puede caber completamente dentro de los cuadrantes inferiores
        bottomQuadrant = (colliderBounds.top > horizontalMidpoint);

    //pRect puede caber completamente en los cuadrantes de la izquierda
    if (colliderBounds.left < verticalMidpoint && colliderBounds.right < verticalMidpoint ) {
      if( topQuadrant ) {
        index = 1;
      } else if( bottomQuadrant ) {
        index = 2;
      }

      //pRect puede encajar completamente en los cuadrantes de la derecha
    } else if( colliderBounds.left > verticalMidpoint ) {
      if( topQuadrant ) {
        index = 0;
      } else if( bottomQuadrant ) {
        index = 3;
      }
    }

    return index;
  }
};


/*
	 * Inserta un objeto en el nodo. Si el nodo supera su capacidad, se dividirá y añadirá todos los
objetos a sus correspondientes subnodos.
	 */
Quadtree.prototype.insert = function( obj ) {
  //evitar la doble inserción
  if(this.objects.indexOf(obj) === -1)
  {

    var i = 0,
        index;

    //si tenemos subnodos ...
    if( typeof this.nodes[0] !== 'undefined' ) {
      index = this.getIndex( obj );

      if( index !== -1 ) {
        this.nodes[index].insert( obj );
        return;
      }
    }

    this.objects.push( obj );

    if( this.objects.length > this.max_objects && this.level < this.max_levels ) {

      //dividir si no tenemos ya subnodos
      if( typeof this.nodes[0] === 'undefined' ) {
        this.split();
      }

      //añadir todos los objetos a sus correspondientes subnodos
      while( i < this.objects.length ) {

        index = this.getIndex( this.objects[i] );

        if( index !== -1 ) {
          this.nodes[index].insert( this.objects.splice(i, 1)[0] );
        } else {
          i = i + 1;
        }
      }
    }
  }
};


/*
	 * Devuelve todos los objetos que podrían colisionar con un área determinada
	 */
Quadtree.prototype.retrieve = function( pRect ) {


  var index = this.getIndex( pRect ),
      returnObjects = this.objects;

  //si tenemos subnodos ...
  if( typeof this.nodes[0] !== 'undefined' ) {

    //si pRect cabe en un subnodo ..
    if( index !== -1 ) {
      returnObjects = returnObjects.concat( this.nodes[index].retrieve( pRect ) );

      //si pRect no cabe en un subnodo, comprobarlo con todos los subnodos
    } else {
      for( var i=0; i < this.nodes.length; i=i+1 ) {
        returnObjects = returnObjects.concat( this.nodes[i].retrieve( pRect ) );
      }
    }
  }

  return returnObjects;
};

Quadtree.prototype.retrieveFromGroup = function( pRect, group ) {

  var results = [];
  var candidates = this.retrieve(pRect);

  for(var i=0; i<candidates.length; i++)
    if(group.contains(candidates[i]))
    results.push(candidates[i]);

  return results;
};

/*
	 * Obtener todos los objetos almacenados en el quadtree
	 */
Quadtree.prototype.getAll = function() {

  var objects = this.objects;

  for( var i=0; i < this.nodes.length; i=i+1 ) {
    objects = objects.concat( this.nodes[i].getAll() );
  }

  return objects;
};


/*
	 * Obtener el nodo en el que se almacena un determinado objeto
	 */
Quadtree.prototype.getObjectNode = function( obj ) {

  var index;

  //si no hay subnodos, el objeto debe estar aquí
  if( !this.nodes.length ) {

    return this;

  } else {

    index = this.getIndex( obj );

    //si el objeto no cabe en un subnodo, debe estar aquí
    if( index === -1 ) {

      return this;

      //si encaja en un subnodo, continúa la búsqueda más profunda allí
    } else {
      var node = this.nodes[index].getObjectNode( obj );
      if( node ) return node;
    }
  }

  return false;
};


/*
	 * Elimina un objeto específico del quadtree
	 * No elimina los subnodos vacíos. Ver función de limpieza
	 */
Quadtree.prototype.removeObject = function( obj ) {

  var node = this.getObjectNode( obj ),
      index = node.objects.indexOf( obj );

  if( index === -1 ) return false;

  node.objects.splice( index, 1);
};


/*
	 * Borrar el quadtree y eliminar todos los objetos
	 */
Quadtree.prototype.clear = function() {

  this.objects = [];

  if( !this.nodes.length ) return;

  for( var i=0; i < this.nodes.length; i=i+1 ) {

    this.nodes[i].clear();
  }

  this.nodes = [];
};


/*
	 * Limpiar el quadtree
	 * Como el clear, pero los objetos no se borrarán sino que se reinsertarán
	 */
Quadtree.prototype.cleanup = function() {

  var objects = this.getAll();

  this.clear();

  for( var i=0; i < objects.length; i++ ) {
    this.insert( objects[i] );
  }
};



function updateTree() {
  if(this.quadTree.active)
  {
    this.quadTree.updateBounds();
    this.quadTree.cleanup();
  }
}

//entrada del teclado
p5.prototype.registerMethod('pre', p5.prototype.readPresses);

//actualización automática de sprites
p5.prototype.registerMethod('pre', p5.prototype.updateSprites);

//Actualización del quadtree
p5.prototype.registerMethod('post', updateTree);

//push y pop de la cámara
p5.prototype.registerMethod('pre', cameraPush);
p5.prototype.registerMethod('post', cameraPop);

p5.prototype.registerPreloadMethod('loadImageElement', p5.prototype);

//deltaTime
//p5.prototype.registerMethod('pre', updateDelta);

/**
 * Registrar un mensaje de advertencia en la consola del host, usando el comando nativo `console.warn`.
 * si está disponible, pero recurriendo a `console.log` si no lo está.  Si no hay
 * consola está disponible, este método fallará silenciosamente.
 * @method _warn
 * @param {!string} message
 * @private
 */
p5.prototype._warn = function(message) {
  var console = window.console;

  if(console)
  {
    if('function' === typeof console.warn)
    {
      console.warn(message);
    }
    else if('function' === typeof console.log)
    {
      console.log('Warning: ' + message);
    }
  }
};

  /**
   * Clase base de la forma de colisión
   *
   * Disponemos de un conjunto de formas de colisión que se ajustan a
   * una interfaz sencilla para que puedan ser comprobadas unas con otras
   * utilizando el teorema del eje de separación.
   *
   * Esta clase base implementa todos los métodos necesarios para una colisión
   * y puede ser utilizada como un punto de colisión sin cambios.
   * Otras formas deben heredar de esta y anular la mayoría de los métodos.
   *
   * @class p5.CollisionShape
   * @constructor
   * @param {p5.Vector} [center] (zero if omitted)
   * @param {number} [rotation] (zero if omitted)
   */
  p5.CollisionShape = function(center, rotation) {
    /**
     * Transformación de esta forma en relación con su padre.  Si no hay padre,
     * esto es más o menos la transformación en el espacio del mundo.
     * Esto debería ser consistente con las propiedades _offset, _rotation y _scale.
     * @property _localTransform
     * @type {p5.Transform2D}
     * @protected
     */
    this._localTransform = new p5.Transform2D();
    if (rotation) {
      this._localTransform.rotate(rotation);
    }
    if (center) {
      this._localTransform.translate(center);
    }

    /**
     * Transformación de cualquier objeto padre (probablemente un sprite) con el que esta forma está
     * asociada a esta forma.  Si se trata de una forma flotante, la transformación del padre
     * seguirá siendo una matriz de identidad.
     * @property _parentTransform
     * @type {p5.Transform2D}
     * @protected
     */
    this._parentTransform = new p5.Transform2D();

    /**
     * El centro de la forma de colisión en el espacio del mundo.
     * @property _center
     * @private
     * @type {p5.Vector}
     */
    this._center = new p5.Vector();

    /**
     * El centro de la forma de colisión en el espacio local; también, el desplazamiento del
     * centro de la forma de colisión desde el centro de su sprite padre.
     * @property _offset
     * @type {p5.Vector}
     * @private
     */
    this._offset = new p5.Vector();

    /**
     * Rotación en radianes en el espacio local (relativo al padre).
     * Tenga en cuenta que esto sólo tendrá sentido para las formas que pueden rotar,
     * es decir, cajas de contorno orientadas
     * @property _rotation
     * @private
     * @type {number}
     */
    this._rotation = 0;

    /**
     * Escala X e Y en el espacio local.  Tenga en cuenta que esto sólo tendrá sentido
     * para las formas que tienen dimensiones (por ejemplo, no para los colisionadores de puntos)
     * @property _scale
     * @type {p5.Vector}
     * @private
     */
    this._scale = new p5.Vector(1, 1);

    /**
     * Escala X e Y en el espacio local.  Tenga en cuenta que esto sólo tendrá sentido
     * para las formas que tienen dimensiones (por ejemplo, no para los colisionadores de puntos)
     * @property getsDimensionsFromSprite
     * @type {boolean}
     */
    this.getsDimensionsFromSprite = false;

    // Conseguidores/configuradores públicos
    Object.defineProperties(this, {

      /**
       * El centro de la forma de colisión en el espacio del mundo.
       * Nota: Puedes establecer esta propiedad con un valor en el espacio del mundo, pero esto
       * realmente modificará la transformación local de la forma de colisión.
       * @property center
       * @type {p5.Vector}
       */
      'center': {
        enumerable: true,
        get: function() {
          return this._center.copy();
        }.bind(this),
        set: function(c) {
          this._localTransform
            .translate(p5.Vector.mult(this._center, -1))
            .translate(c);
          this._onTransformChanged();
        }.bind(this)
      },

      /**
       * El centro de la forma de colisión en el espacio local - si este colisionador es propiedad de un sprite, el desplazamiento del centro del colisionador desde el centro del sprite.
       * @property offset
       * @type {p5.Vector}
       */
      'offset': {
        enumerable: true,
        get: function() {
          return this._offset.copy();
        }.bind(this),
        set: function(o) {
          this._localTransform
            .translate(p5.Vector.mult(this._offset, -1))
            .translate(o);
          this._onTransformChanged();
        }.bind(this)
      },

      /**
       * La rotación del espacio local del colisionador, en radianes.
       * @property rotation
       * @type {number}
       */
      'rotation': {
        enumerable: true,
        get: function() {
          return this._rotation;
        }.bind(this),
        set: function(r) {
          this._localTransform
            .clear()
            .scale(this._scale)
            .rotate(r)
            .translate(this._offset);
          this._onTransformChanged();
        }.bind(this)
      },

      /**
       * La escala espacial local del colisionador
       * @property scale
       * @type {p5.Vector}
       */
      'scale': {
        enumerable: true,
        get: function() {
          return this._scale.copy();
        }.bind(this),
        set: function(s) {
          this._localTransform
            .clear()
            .scale(s)
            .rotate(this._rotation)
            .translate(this._offset);
          this._onTransformChanged();
        }.bind(this)
      }
    });

    this._onTransformChanged();
  };

  /**
   * Actualiza este collider basándose en las propiedades de un Sprite padre.
   * Las clases descendientes deben anular este método para adoptar las dimensiones del sprite si `getsDimensionsFromSprite` es verdadero.
   * @method updateFromSprite
   * @param {Sprite} sprite
   * @see p5.CollisionShape.prototype.getsDimensionsFromSprite
   */
  p5.CollisionShape.prototype.updateFromSprite = function(sprite) {
    this.setParentTransform(sprite);
  };

  /**
   * Actualiza la transformación padre de este colisionador, que a su vez ajustará su
   * posición, rotación y escala en el espacio del mundo y recalculará los valores de la caché
   * si es necesario.
   * Si se pasa un Sprite como "padre", se calculará una nueva transformación
   * a partir de la posición/rotación/escala del sprite y se utilizará.
   * @method setParentTransform
   * @param {p5.Transform2D|Sprite} parent
   */
  p5.CollisionShape.prototype.setParentTransform = function(parent) {
    if (parent instanceof Sprite) {
      this._parentTransform
        .clear()
        .scale(parent._getScaleX(), parent._getScaleY())
        .rotate(radians(parent.rotation))
        .translate(parent.position);
    } else if (parent instanceof p5.Transform2D) {
      this._parentTransform = parent.copy();
    } else {
      throw new TypeError('Bad argument to setParentTransform: ' + parent);
    }
    this._onTransformChanged();
  };

  /**
   * Recalcular las propiedades en caché, los vectores relevantes, etc. cuando al menos una
   * de las transformaciones de la forma cambia.  El CollisionShape base (y el PointCollider)
   * sólo necesitan recalcular el centro de la forma, pero otras formas pueden necesitar
   * anular este método y hacer un recálculo adicional.
   * @method _onTransformChanged
   * @protected
   */
  p5.CollisionShape.prototype._onTransformChanged = function() {
    // Recalcular las propiedades internas a partir de las transformaciones

    // Rotación en el espacio local
    this._rotation = this._localTransform.getRotation();

    // Escala en el espacio local
    this._scale = this._localTransform.getScale();

    // Desplazamiento en el espacio local
    this._offset
      .set(0, 0)
      .transform(this._localTransform);

    // Centro en el espacio-mundo
    this._center
      .set(this._offset.x, this._offset.y)
      .transform(this._parentTransform);
  };

  /**
   * Calcula el menor movimiento necesario para mover esta forma de colisión fuera de
   * otra forma de colisión.  Si las formas no se superponen, devuelve un
   * vector cero para indicar que no es necesario ningún desplazamiento.
   * @method collide
   * @param {p5.CollisionShape} other
   * @return {p5.Vector}
   */
  p5.CollisionShape.prototype.collide = function(other) {
    var displacee = this, displacer = other;

    // Calcular un vector de desplazamiento utilizando el teorema del eje de separación
    // (Válido sólo para formas convexas)
    //
    // Si existe una línea (eje) sobre la que las proyecciones ortogonales de las dos formas
    // no se superponen, entonces las formas no se superponen.  Si las proyecciones
    // las proyecciones de las formas se solapan en todos los ejes candidatos, el eje que tenía el menor solapamiento nos da el menor desplazamiento posible.
    //
    // @see http://www.dyn4j.org/2010/01/sat/
    var smallestOverlap = Infinity;
    var smallestOverlapAxis = null;

    // Aceleramos las cosas con la suposición adicional de que todas las formas de colisión son centro-simétricas: Círculos, elipses y rectángulos están bien.  Esto nos permite comparar sólo los radios de las formas con la distancia entre sus centros, incluso para las formas no circulares.
    // Otras formas convexas, (triángulos, pentágonos) requerirán un uso más complejo de las posiciones de sus proyecciones sobre el eje.

    var deltaOfCenters = p5.Vector.sub(displacer.center, displacee.center);

    // Resulta que sólo tenemos que comprobar unos pocos ejes, definidos por las formas que se comprueban.  Para un polígono, la normal de cada cara es un posible eje de separación.
    var candidateAxes = p5.CollisionShape._getCandidateAxesForShapes(displacee, displacer);
    var axis, deltaOfCentersOnAxis, distanceOfCentersOnAxis;
    for (var i = 0; i < candidateAxes.length; i++) {
      axis = candidateAxes[i];

      // Si la distancia entre los centros de las formas proyectadas sobre el
      // eje de separación es mayor que los radios combinados de las formas
      // proyectadas sobre el eje, las formas no se superponen en este eje.
      deltaOfCentersOnAxis = p5.Vector.project(deltaOfCenters, axis);
      distanceOfCentersOnAxis = deltaOfCentersOnAxis.mag();
      var r1 = displacee._getRadiusOnAxis(axis);
      var r2 = displacer._getRadiusOnAxis(axis);
      var overlap = r1 + r2 - distanceOfCentersOnAxis;
      if (overlap <= 0) {
        // Estas formas están separadas a lo largo de este eje.
        // Se sale antes, devolviendo un desplazamiento de vector cero.
        return new p5.Vector();
      } else if (overlap < smallestOverlap) {
        // Este es el solapamiento más pequeño que hemos encontrado hasta ahora - almacena alguna información sobre él, que podemos utilizar para dar el menor
        // desplazamiento cuando hayamos terminado.
        smallestOverlap = overlap;
        // Normalmente se utiliza el delta de los centros, que nos da la dirección a lo largo de un eje.  En el raro caso de que los centros se superpongan exactamente,
        // sólo hay que utilizar el eje original
        if (deltaOfCentersOnAxis.x === 0 && deltaOfCentersOnAxis.y === 0) {
          smallestOverlapAxis = axis;
        } else {
          smallestOverlapAxis = deltaOfCentersOnAxis;
        }
      }
    }

    // Si lo hacemos aquí, nos solapamos en todos los ejes posibles y
    // podemos calcular el vector más pequeño que desplazará a este fuera de otro.
    return smallestOverlapAxis.copy().setMag(-smallestOverlap);
  };


  /**
   * Comprueba si esta forma se solapa con otra.
   * @method overlap
   * @param {p5.CollisionShape} other
   * @return {boolean}
   */
  p5.CollisionShape.prototype.overlap = function(other) {
    var displacement = this.collide(other);
    return displacement.x !== 0 || displacement.y !== 0;
  };

  /**
   * @method _getCanididateAxesForShapes
   * @private
   * @static
   * @param {p5.CollisionShape} shape1
   * @param {p5.CollisionShape} shape2
   * @return {Array.<p5.Vector>}
   */
  p5.CollisionShape._getCandidateAxesForShapes = function(shape1, shape2) {
    var axes = shape1._getCandidateAxes(shape2)
      .concat(shape2._getCandidateAxes(shape1))
      .map(function(axis) {
        if (axis.x === 0 && axis.y === 0) {
          return p5.CollisionShape.X_AXIS;
        }
        return axis;
      });
    return deduplicateParallelVectors(axes);
  };

  /*
   * Reduce una matriz de vectores a un conjunto de ejes únicos (es decir, no debe haber dos vectores en la matriz que sean paralelos).
   * @param {Array.<p5.Vector>} array
   * @return {Array}
   */
  function deduplicateParallelVectors(array) {
    return array.filter(function(item, itemPos) {
      return !array.some(function(other, otherPos) {
        return itemPos < otherPos && item.isParallel(other);
      });
    });
  }

  /**
   * Calcula los ejes de separación candidatos en relación con otro objeto.
   * Anula este método en las subclases para implementar el comportamiento de colisión.
   * @method _getCandidateAxes
   * @protected
   * @return {Array.<p5.Vector>}
   */
  p5.CollisionShape.prototype._getCandidateAxes = function() {
    return [];
  };

  /**
   * Obtener el radio de esta forma (la mitad de su proyección) a lo largo del eje dado.
   * Anula este método en las subclases para implementar el comportamiento de colisión.
   * @method _getRadiusOnAxis
   * @protected
   * @param {p5.Vector} axis
   * @return {number}
   */
  p5.CollisionShape.prototype._getRadiusOnAxis = function() {
    return 0;
  };

  /**
   * Obtenga el radio mínimo de la forma en cualquier eje para las comprobaciones de túneles.
   * @method _getMinRadius
   * @protected
   * @param {p5.Vector} axis
   * @return {number}
   */
  p5.CollisionShape.prototype._getMinRadius = function() {
    return 0;
  };

  /**
   * @property X_AXIS
   * @type {p5.Vector}
   * @static
   * @final
   */
  p5.CollisionShape.X_AXIS = new p5.Vector(1, 0);

  /**
   * @property Y_AXIS
   * @type {p5.Vector}
   * @static
   * @final
   */
  p5.CollisionShape.Y_AXIS = new p5.Vector(0, 1);

  /**
   * @property WORLD_AXES
   * @type {Array.<p5.Vector>}
   * @static
   * @final
   */
  p5.CollisionShape.WORLD_AXES = [
    p5.CollisionShape.X_AXIS,
    p5.CollisionShape.Y_AXIS
  ];

  /**
   * Obtiene la información de los límites alineados con el eje del espacio del mundo para esta forma de colisión.
   * Se utiliza principalmente para el quadtree.
   * @method getBoundingBox
   * @return {{top: number, bottom: number, left: number, right: number, width: number, height: number}}
   */
  p5.CollisionShape.prototype.getBoundingBox = function() {
    var radiusOnX = this._getRadiusOnAxis(p5.CollisionShape.X_AXIS);
    var radiusOnY = this._getRadiusOnAxis(p5.CollisionShape.Y_AXIS);
    return {
      top: this.center.y - radiusOnY,
      bottom: this.center.y + radiusOnY,
      left: this.center.x - radiusOnX,
      right: this.center.x + radiusOnX,
      width: radiusOnX * 2,
      height: radiusOnY * 2
    };
  };

  /**
   * Una forma de colisión puntual, utilizada para detectar vectores de solapamiento y desplazamiento
   * frente a otras formas de colisión.
   * @class p5.PointCollider
   * @constructor
   * @extends p5.CollisionShape
   * @param {p5.Vector} center
   */
  p5.PointCollider = function(center) {
    p5.CollisionShape.call(this, center);
  };
  p5.PointCollider.prototype = Object.create(p5.CollisionShape.prototype);

  /**
   * Construye un nuevo PointCollider con el desplazamiento dado para el sprite dado.
   * @method createFromSprite
   * @static
   * @param {Sprite} sprite
   * @param {p5.Vector} [offset] desde el centro del sprite
   * @return {p5.PointCollider}
   */
  p5.PointCollider.createFromSprite = function(sprite, offset) {
    // Crear la forma de colisión en el desplazamiento transformado
    var shape = new p5.PointCollider(offset);
    shape.setParentTransform(sprite);
    return shape;
  };

  /**
   * Depurar-dibujar este punto de colisión
   * @method draw
   * @param {p5} sketch instancia a utilizar para dibujar
   */
  p5.PointCollider.prototype.draw = function(sketch) {
    sketch.push();
    sketch.rectMode(sketch.CENTER);
    sketch.translate(this.center.x, this.center.y);
    sketch.noStroke();
    sketch.fill(0, 255, 0);
    sketch.ellipse(0, 0, 2, 2);
    sketch.pop();
  };

  /**
   * Una forma de colisión circular, utilizada para detectar vectores de solapamiento y desplazamiento
   * con otras formas de colisión.
   * @class p5.CircleCollider
   * @constructor
   * @extends p5.CollisionShape
   * @param {p5.Vector} center
   * @param {number} radius
   */
  p5.CircleCollider = function(center, radius) {
    p5.CollisionShape.call(this, center);

    /**
     * El radio no escalado del círculo colisionador.
     * @property radius
     * @type {number}
     */
    this.radius = radius;

    /**
     * El radio final de este círculo después de haber sido escalado por las transformaciones padre y local, almacenado en caché para que no lo recalculemos todo el tiempo.
     * @property _scaledRadius
     * @type {number}
     * @private
     */
    this._scaledRadius = 0;

    this._computeScaledRadius();
  };
  p5.CircleCollider.prototype = Object.create(p5.CollisionShape.prototype);

  /**
   * Construye un nuevo CircleCollider con el desplazamiento dado para el sprite dado.
   * @method createFromSprite
   * @static
   * @param {Sprite} sprite
   * @param {p5.Vector} [offset] desde el centro del sprite
   * @param {number} [radius]
   * @return {p5.CircleCollider}
   */
  p5.CircleCollider.createFromSprite = function(sprite, offset, radius) {
    var customSize = typeof radius === 'number';
    var shape = new p5.CircleCollider(
      offset,
      customSize ? radius : 1
    );
    shape.getsDimensionsFromSprite = !customSize;
    shape.updateFromSprite(sprite);
    return shape;
  };

  /**
   * Actualiza este collider basándose en las propiedades de un Sprite padre.
   * @method updateFromSprite
   * @param {Sprite} sprite
   * @see p5.CollisionShape.prototype.getsDimensionsFromSprite
   */
  p5.CircleCollider.prototype.updateFromSprite = function(sprite) {
    if (this.getsDimensionsFromSprite) {
      if (sprite.animation) {
        this.radius = Math.max(sprite.animation.getWidth(), sprite.animation.getHeight())/2;
      } else {
        this.radius = Math.max(sprite.width, sprite.height)/2;
      }
    }
    this.setParentTransform(sprite);
  };

  /**
   * Recalcular las propiedades en caché, los vectores relevantes, etc. cuando al menos una
   * de las transformaciones de la forma cambia.  El CollisionShape base (y el PointCollider)
   * sólo necesitan recalcular el centro de la forma, pero otras formas pueden necesitar
   * anular este método y hacer un recálculo adicional.
   * @method _onTransformChanged
   * @protected
   */
  p5.CircleCollider.prototype._onTransformChanged = function() {
    p5.CollisionShape.prototype._onTransformChanged.call(this);
    this._computeScaledRadius();
  };

  /**
   * Llamada para actualizar el valor del radio escalado en caché.
   * @method _computeScaledRadius
   * @private
   */
  p5.CircleCollider.prototype._computeScaledRadius = function() {
    this._scaledRadius = new p5.Vector(this.radius, 0)
      .transform(this._localTransform)
      .transform(this._parentTransform)
      .sub(this.center)
      .mag();
  };

  /**
   * Depurar-dibujar esta forma de colisión.
   * @method draw
   * @param {p5} sketch instance to use for drawing
   */
  p5.CircleCollider.prototype.draw = function(sketch) {
    sketch.push();
    sketch.noFill();
    sketch.stroke(0, 255, 0);
    sketch.rectMode(sketch.CENTER);
    sketch.ellipse(this.center.x, this.center.y, this._scaledRadius*2, this._scaledRadius*2);
    sketch.pop();
  };

    /**
   * Anula CollisionShape.setParentTransform
   * Actualiza la transformación padre de este colisionador, que a su vez ajustará su
   * posición, rotación y escala en el espacio del mundo y recalcular los valores de la caché
   * si es necesario.
   * Si se pasa un Sprite como "padre", se calculará una nueva transformación
   * a partir de la posición/rotación/escala del sprite y se utilizará.
   * Utiliza el máximo de los valores de las escalas x e y para que el círculo abarque el sprite.
   * @method setParentTransform
   * @param {p5.Transform2D|Sprite} parent
   */
  p5.CircleCollider.prototype.setParentTransform = function(parent) {
    if (parent instanceof Sprite) {
      this._parentTransform
        .clear()
        .scale(Math.max(parent._getScaleX(), parent._getScaleY()))
        .rotate(radians(parent.rotation))
        .translate(parent.position);
    } else if (parent instanceof p5.Transform2D) {
      this._parentTransform = parent.copy();
    } else {
      throw new TypeError('Bad argument to setParentTransform: ' + parent);
    }
    this._onTransformChanged();
  };

  /**
   * Calcula los ejes de separación candidatos en relación con otro objeto.
   * @method _getCandidateAxes
   * @protected
   * @param {p5.CollisionShape} other
   * @return {Array.<p5.Vector>}
   */
  p5.CircleCollider.prototype._getCandidateAxes = function(other) {
    // Un círculo tiene infinitos posibles ejes candidatos, así que los que elijamos dependerán de contra qué colisionemos.

    // TODO:  Si podemos pedir a la otra forma una lista de vértices, entonces podemos
    //        generalizar este algoritmo utilizando siempre el más cercano, y
    //        eliminar el conocimiento especial de OBB y AABB.

    if (other instanceof p5.OrientedBoundingBoxCollider || other instanceof p5.AxisAlignedBoundingBoxCollider) {
      // Hay cuatro posibles ejes de separación con una caja - uno para cada uno de sus vértices, a través del centro del círculo.
      // Necesitamos el más cercano.
      var smallestSquareDistance = Infinity;
      var axisToClosestVertex = null;

      // Generar el conjunto de vértices para la otra forma
      var halfDiagonals = other.halfDiagonals;
      [
        p5.Vector.add(other.center, halfDiagonals[0]),
        p5.Vector.add(other.center, halfDiagonals[1]),
        p5.Vector.sub(other.center, halfDiagonals[0]),
        p5.Vector.sub(other.center, halfDiagonals[1])
      ].map(function(vertex) {
        // Transforma cada vértice en un vector desde el centro de este colisionador hasta ese vértice, que define un eje que podríamos querer comprobar.
        return vertex.sub(this.center);
      }.bind(this)).forEach(function(vector) {
        // Averigua cuál es el vértice más cercano y utiliza su eje
        var squareDistance = vector.magSq();
        if (squareDistance < smallestSquareDistance) {
          smallestSquareDistance = squareDistance;
          axisToClosestVertex = vector;
        }
      });
      return [axisToClosestVertex];
    }

    // Cuando se comprueba contra otro círculo o un punto sólo necesitamos comprobar el
    // eje que pasa por los centros de ambas formas.
    return [p5.Vector.sub(other.center, this.center)];
  };

  /**
   * Get this shape's radius (half-width of its projection) along the given axis.
   * @method _getRadiusOnAxis
   * @protected
   * @return {number}
   */
  p5.CircleCollider.prototype._getRadiusOnAxis = function() {
    return this._scaledRadius;
  };

  /**
   * Obtenga el radio mínimo de la forma en cualquier eje para las comprobaciones de túneles.
   * @method _getMinRadius
   * @protected
   * @param {p5.Vector} axis
   * @return {number}
   */
  p5.CircleCollider.prototype._getMinRadius = function() {
    return this._scaledRadius;
  };

  /**
   * Una forma de colisión Axis-Aligned Bounding Box (AABB), utilizada para detectar el solapamiento
   * y calcular los vectores de desplazamiento mínimo con otras formas de colisión.
   *
   * No se puede girar, de ahí su nombre.  Puede utilizarlo en lugar de un
   * OBB porque simplifica algunas de las matemáticas y puede mejorar el rendimiento.
   *
   * @class p5.AxisAlignedBoundingBoxCollider
   * @constructor
   * @extends p5.CollisionShape
   * @param {p5.Vector} center
   * @param {number} width
   * @param {number} height
   */
  p5.AxisAlignedBoundingBoxCollider = function(center, width, height) {
    p5.CollisionShape.call(this, center);

    /**
     * Ancho de la caja sin escalar.
     * @property _width
     * @private
     * @type {number}
     */
    this._width = width;

    /**
     * Altura de la caja sin escalar.
     * @property _width
     * @private
     * @type {number}
     */
    this._height = height;

    /**
     * Semidiagonal en caché, utilizada para calcular el radio proyectado.
     * Ya transformado en espacio-mundo.
     * @property _halfDiagonals
     * @private
     * @type {Array.<p5.Vector>}
     */
    this._halfDiagonals = [];

    Object.defineProperties(this, {

      /**
       * El ancho no transformado del colisionador de la caja.
       * Vuelve a calcular las diagonales cuando se establece.
       * @property width
       * @type {number}
       */
      'width': {
        enumerable: true,
        get: function() {
          return this._width;
        }.bind(this),
        set: function(w) {
          this._width = w;
          this._halfDiagonals = this._computeHalfDiagonals();
        }.bind(this)
      },

      /**
       * La altura no rotada del colisionador de la caja.
       * Vuelve a calcular las diagonales cuando se establece.
       * @property height
       * @type {number}
       */
      'height': {
        enumerable: true,
        get: function() {
          return this._height;
        }.bind(this),
        set: function(h) {
          this._height = h;
          this._halfDiagonals = this._computeHalfDiagonals();
        }.bind(this)
      },

      /**
       * Dos vectores que representan los semidiagonos adyacentes de la caja en sus
       * dimensiones y orientación actuales.
       * @property halfDiagonals
       * @readOnly
       * @type {Array.<p5.Vector>}
       */
      'halfDiagonals': {
        enumerable: true,
        get: function() {
          return this._halfDiagonals;
        }.bind(this)
      }
    });

    this._computeHalfDiagonals();
  };
  p5.AxisAlignedBoundingBoxCollider.prototype = Object.create(p5.CollisionShape.prototype);

  /**
   * Construye un nuevo AxisAlignedBoundingBoxCollider con el desplazamiento dado para el sprite dado.
   * @method createFromSprite
   * @static
   * @param {Sprite} sprite
   * @param {p5.Vector} [offset] desde el centro del sprite
   * @return {p5.CircleCollider}
   */
  p5.AxisAlignedBoundingBoxCollider.createFromSprite = function(sprite, offset, width, height) {
    var customSize = typeof width === 'number' && typeof height === 'number';
    var box = new p5.AxisAlignedBoundingBoxCollider(
      offset,
      customSize ? width : 1,
      customSize ? height : 1
    );
    box.getsDimensionsFromSprite = !customSize;
    box.updateFromSprite(sprite);
    return box;
  };

  /**
   * Actualiza este collider basándose en las propiedades de un Sprite padre.
   * @method updateFromSprite
   * @param {Sprite} sprite
   * @see p5.CollisionShape.prototype.getsDimensionsFromSprite
   */
  p5.AxisAlignedBoundingBoxCollider.prototype.updateFromSprite = function(sprite) {
    if (this.getsDimensionsFromSprite) {
      if (sprite.animation) {
        this._width = sprite.animation.getWidth();
        this._height = sprite.animation.getHeight();
      } else {
        this._width = sprite.width;
        this._height = sprite.height;
      }
    }
    this.setParentTransform(sprite);
  };

  /**
   * Recalcular las propiedades en caché, los vectores relevantes, etc. cuando al menos una
   * de las transformaciones de la forma cambia.  El CollisionShape base (y el PointCollider)
   * sólo necesitan recalcular el centro de la forma, pero otras formas pueden necesitar
   * anular este método y hacer un recálculo adicional.
   * @method _onTransformChanged
   * @protected
   */
  p5.AxisAlignedBoundingBoxCollider.prototype._onTransformChanged = function() {
    p5.CollisionShape.prototype._onTransformChanged.call(this);
    this._computeHalfDiagonals();
  };

  /**
   * Recalcular los vectores semidiagonales de esta caja delimitadora.
   * @method _computeHalfDiagonals
   * @private
   * @return {Array.<p5.Vector>}
   */
  p5.AxisAlignedBoundingBoxCollider.prototype._computeHalfDiagonals = function() {
    // Transformamos el rectángulo (que puede escalarse y rotarse) y luego calculamos
    // una caja delimitadora alineada con el eje _around_ it.
    var composedTransform = p5.Transform2D.mult(this._parentTransform, this._localTransform);
    var transformedDiagonals = [
      new p5.Vector(this._width / 2, -this._height / 2),
      new p5.Vector(this._width / 2, this._height / 2),
      new p5.Vector(-this._width / 2, this._height / 2)
    ].map(function(vertex) {
      return vertex.transform(composedTransform).sub(this.center);
    }.bind(this));

    var halfWidth = Math.max(
      Math.abs(transformedDiagonals[0].x),
      Math.abs(transformedDiagonals[1].x)
    );
    var halfHeight = Math.max(
      Math.abs(transformedDiagonals[1].y),
      Math.abs(transformedDiagonals[2].y)
    );

    this._halfDiagonals = [
      new p5.Vector(halfWidth, -halfHeight),
      new p5.Vector(halfWidth, halfHeight)
    ];
  };

  /**
   * Depurar y dibujar este colisionador.
   * @method draw
   * @param {p5} sketch - instancia p5 a utilizar para dibujar
   */
  p5.AxisAlignedBoundingBoxCollider.prototype.draw = function(sketch) {
    sketch.push();
    sketch.rectMode(sketch.CENTER);
    sketch.translate(this.center.x, this.center.y);
    sketch.noFill();
    sketch.stroke(0, 255, 0);
    sketch.strokeWeight(1);
    sketch.rect(0, 0, Math.abs(this._halfDiagonals[0].x) * 2, Math.abs(this._halfDiagonals[0].y) * 2);
    sketch.pop();
  };

  /**
   * Calcula los ejes de separación candidatos en relación con otro objeto.
   * @method _getCandidateAxes
   * @protected
   * @return {Array.<p5.Vector>}
   */
  p5.AxisAlignedBoundingBoxCollider.prototype._getCandidateAxes = function() {
    return p5.CollisionShape.WORLD_AXES;
  };

  /**
   * Obtiene el radio de esta forma (la mitad de su proyección) a lo largo del eje dado.
   * @method _getRadiusOnAxis
   * @protected
   * @param {p5.Vector} axis
   * @return {number}
   */
  p5.AxisAlignedBoundingBoxCollider.prototype._getRadiusOnAxis = function(axis) {
    // Cómo proyectar un rect en un eje:
    // Proyecta los vectores centro-esquina de dos esquinas adyacentes (almacenados aquí)
    // sobre el eje.  La magnitud mayor de las dos es el radio de tu proyección.
    return Math.max(
      p5.Vector.project(this._halfDiagonals[0], axis).mag(),
      p5.Vector.project(this._halfDiagonals[1], axis).mag());
  };

  /**
   * Obtiene el radio mínimo de la forma en cualquier eje para las comprobaciones de túneles.
   * @method _getMinRadius
   * @protected
   * @param {p5.Vector} axis
   * @return {number}
   */
  p5.AxisAlignedBoundingBoxCollider.prototype._getMinRadius = function() {
    return Math.min(this._width, this._height);
  };

  /**
   * Una forma de colisión Oriented Bounding Box (OBB), utilizada para detectar el solapamiento y
   * calcular los vectores de desplazamiento mínimo con otras formas de colisión.
   * @class p5.OrientedBoundingBoxCollider
   * @constructor
   * @extends p5.CollisionShape
   * @param {p5.Vector} center del rectángulo en el espacio del mundo
   * @param {number} width del rectángulo (cuando no está girado)
   * @param {number} height del rectángulo (cuando no está girado)
   * @param {number} rotation sobre el centro, en radianes
   */
  p5.OrientedBoundingBoxCollider = function(center, width, height, rotation) {
    p5.CollisionShape.call(this, center, rotation);

    /**
     * Ancho de la caja sin escalar.
     * @property _width
     * @private
     * @type {number}
     */
    this._width = width;

    /**
     * Altura de la caja sin escalar.
     * @property _width
     * @private
     * @type {number}
     */
    this._height = height;

    /**
     * Ejes de separación en caché esta forma contribuye a una colisión.
     * @property _potentialAxes
     * @private
     * @type {Array.<p5.Vector>}
     */
    this._potentialAxes = [];

    /**
     * Semidiagonal en caché, utilizada para calcular el radio proyectado.
     * Ya transformado en espacio-mundo.
     * @property _halfDiagonals
     * @private
     * @type {Array.<p5.Vector>}
     */
    this._halfDiagonals = [];

    Object.defineProperties(this, {

      /**
       * El ancho no rotado del colisionador de la caja.
       * Vuelve a calcular las diagonales cuando se establece.
       * @property width
       * @type {number}
       */
      'width': {
        enumerable: true,
        get: function() {
          return this._width;
        }.bind(this),
        set: function(w) {
          this._width = w;
          this._onTransformChanged();
        }.bind(this)
      },

      /**
       * La altura no rotada del colisionador de la caja.
       * Vuelve a calcular las diagonales cuando se establece.
       * @property height
       * @type {number}
       */
      'height': {
        enumerable: true,
        get: function() {
          return this._height;
        }.bind(this),
        set: function(h) {
          this._height = h;
          this._onTransformChanged();
        }.bind(this)
      },

      /**
       * Dos vectores que representan los semidiagonos adyacentes de la caja en sus
       * dimensiones y orientación actuales.
       * @property halfDiagonals
       * @readOnly
       * @type {Array.<p5.Vector>}
       */
      'halfDiagonals': {
        enumerable: true,
        get: function() {
          return this._halfDiagonals;
        }.bind(this)
      }
    });

    this._onTransformChanged();
  };
  p5.OrientedBoundingBoxCollider.prototype = Object.create(p5.CollisionShape.prototype);

  /**
   * Construye un nuevo AxisAlignedBoundingBoxCollider con el desplazamiento dado para el sprite dado.
   * @method createFromSprite
   * @static
   * @param {Sprite} sprite
   * @param {p5.Vector} [offset] desde el centro del sprite
   * @param {number} [width]
   * @param {number} [height]
   * @param {number} [rotation] en radianes
   * @return {p5.CircleCollider}
   */
  p5.OrientedBoundingBoxCollider.createFromSprite = function(sprite, offset, width, height, rotation) {
    var customSize = typeof width === 'number' && typeof height === 'number';
    var box = new p5.OrientedBoundingBoxCollider(
      offset,
      customSize ? width : 1,
      customSize ? height : 1,
      rotation
    );
    box.getsDimensionsFromSprite = !customSize;
    box.updateFromSprite(sprite);
    return box;
  };

  /**
   * Actualiza este collider basándose en las propiedades de un Sprite padre.
   * @method updateFromSprite
   * @param {Sprite} sprite
   * @see p5.CollisionShape.prototype.getsDimensionsFromSprite
   */
  p5.OrientedBoundingBoxCollider.prototype.updateFromSprite =
    p5.AxisAlignedBoundingBoxCollider.prototype.updateFromSprite;

  /**
   * Asumiendo que este colisionador es el colisionador de barrido de un sprite, actualízalo basándote en
   * las propiedades del sprite padre para que encierre la posición actual del sprite y su posición proyectada.
   * @method updateSweptColliderFromSprite
   * @param {Sprite} sprite
   */
  p5.OrientedBoundingBoxCollider.prototype.updateSweptColliderFromSprite = function(sprite) {
    var vMagnitude = sprite.velocity.mag();
    var vPerpendicular = new p5.Vector(sprite.velocity.y, -sprite.velocity.x);
    this._width = vMagnitude + 2 * sprite.collider._getRadiusOnAxis(sprite.velocity);
    this._height = 2 * sprite.collider._getRadiusOnAxis(vPerpendicular);
    var newRotation = radians(sprite.getDirection());
    var newCenter = new p5.Vector(
      sprite.newPosition.x + 0.5 * sprite.velocity.x,
      sprite.newPosition.y + 0.5 * sprite.velocity.y
    );
    // Realiza this.rotation = newRotation y this.center = newCenter;
    this._localTransform
      .clear()
      .scale(this._scale)
      .rotate(newRotation)
      .translate(this._offset)
      .translate(p5.Vector.mult(this._center, -1))
      .translate(newCenter);
    this._onTransformChanged();
  };

  /**
   * Recalcular las propiedades en caché, los vectores relevantes, etc. cuando al menos una
   * de las transformaciones de la forma cambia.  El CollisionShape base (y el PointCollider)
   * sólo necesitan recalcular el centro de la forma, pero otras formas pueden necesitar
   * anular este método y hacer un recálculo adicional.
   * @method _onTransformChanged
   * @protected
   */
  p5.OrientedBoundingBoxCollider.prototype._onTransformChanged = function() {
    p5.CollisionShape.prototype._onTransformChanged.call(this);

    // Transformar cada vértice por las matrices local y global
    // y luego utilizar sus diferencias para determinar la anchura, la altura y los medios diagonales
    var composedTransform = p5.Transform2D.mult(this._parentTransform, this._localTransform);
    var transformedVertices = [
      new p5.Vector(this._width / 2, -this._height / 2),
      new p5.Vector(this._width / 2, this._height / 2),
      new p5.Vector(-this._width / 2, this._height / 2)
    ].map(function(vertex) {
      return vertex.transform(composedTransform);
    });

    this._halfDiagonals = [
      p5.Vector.sub(transformedVertices[0], this.center),
      p5.Vector.sub(transformedVertices[1], this.center)
    ];

    this._potentialAxes = [
      p5.Vector.sub(transformedVertices[1], transformedVertices[2]),
      p5.Vector.sub(transformedVertices[1], transformedVertices[0])
    ];
  };

  /**
   * Depurar y dibujar este colisionador.
   * @method draw
   * @param {p5} sketch - instancia p5 a utilizar para dibujar
   */
  p5.OrientedBoundingBoxCollider.prototype.draw = function(sketch) {
    var composedTransform = p5.Transform2D.mult(this._localTransform, this._parentTransform);
    var scale = composedTransform.getScale();
    var rotation = composedTransform.getRotation();
    sketch.push();
    sketch.translate(this.center.x, this.center.y);
    sketch.scale(scale.x, scale.y);
    if (sketch._angleMode === sketch.RADIANS) {
      sketch.rotate(rotation);
    } else {
      sketch.rotate(degrees(rotation));
    }

    sketch.noFill();
    sketch.stroke(0, 255, 0);
    sketch.strokeWeight(1);
    sketch.rectMode(sketch.CENTER);
    sketch.rect(0, 0, this._width, this._height);
    sketch.pop();
  };

  /**
   * Calcula los ejes de separación candidatos en relación con otro objeto.
   * @method _getCandidateAxes
   * @protected
   * @return {Array.<p5.Vector>}
   */
  p5.OrientedBoundingBoxCollider.prototype._getCandidateAxes = function() {
    // Un cuadro delimitador orientado siempre proporciona dos de sus normales de cara,
    // que hemos precalculado.
    return this._potentialAxes;
  };

  /**
   * Obtiene el radio de esta forma (la mitad de su proyección) a lo largo del eje dado.
   * @method _getRadiusOnAxis
   * @protected
   * @param {p5.Vector} axis
   * @return {number}
   */
  p5.OrientedBoundingBoxCollider.prototype._getRadiusOnAxis =
    p5.AxisAlignedBoundingBoxCollider.prototype._getRadiusOnAxis;
  // Podemos reutilizar la versión AABB de este método porque ambos proyectan
  // semidiagonales en caché - el mismo código funciona.

  /**
   * Cuando se comprueba la existencia de túneles a través de un OrientedBoundingBoxCollider se utiliza un caso peor de cero (por ejemplo, si el otro sprite está pasando por una esquina).
   * @method _getMinRadius
   * @protected
   * @param {p5.Vector} axis
   * @return {number}
   */
  p5.OrientedBoundingBoxCollider.prototype._getMinRadius =
    p5.AxisAlignedBoundingBoxCollider.prototype._getMinRadius;

  /**
   * Una transformación afín 2D (traslación, rotación, escala) almacenada como una matriz de 3x3 que utiliza coordenadas homogéneas.  Se utiliza para transformar rápidamente
   * puntos o vectores entre marcos de referencia.
   * @class p5.Transform2D
   * @constructor
   * @extends Array
   * @param {p5.Transform2D|Array.<number>} [source]
   */
  p5.Transform2D = function(source) {
    // Sólo almacenamos los seis primeros valores.
    // la última fila en una matriz de transformación 2D es siempre "0 0 1" por lo que podemos
    // ahorrar espacio y acelerar ciertos cálculos con esta suposición.
    source = source || [1, 0, 0, 0, 1, 0];
    if (source.length !== 6) {
      throw new TypeError('Transform2D must have six components');
    }
    this.length = 6;
    this[0] = source[0];
    this[1] = source[1];
    this[2] = source[2];
    this[3] = source[3];
    this[4] = source[4];
    this[5] = source[5];
  };
  p5.Transform2D.prototype = Object.create(Array.prototype);

  /**
   * Restablece esta transformación a una transformación de identidad, en su lugar.
   * @method clear
   * @return {p5.Transform2D} esta transformación
   */
  p5.Transform2D.prototype.clear = function() {
    this[0] = 1;
    this[1] = 0;
    this[2] = 0;
    this[3] = 0;
    this[4] = 1;
    this[5] = 0;
    return this;
  };

  /**
   * Haz una copia de esta transformación.
   * @method copy
   * @return {p5.Transform2D}
   */
  p5.Transform2D.prototype.copy = function() {
    return new p5.Transform2D(this);
  };

  /**
   * Comprueba si dos transformaciones son iguales.
   * @method equals
   * @param {p5.Transform2D|Array.<number>} other
   * @return {boolean}
   */
  p5.Transform2D.prototype.equals = function(other) {
    if (!(other instanceof p5.Transform2D || Array.isArray(other))) {
      return false; // Nunca es igual a otros tipos.
    }

    for (var i = 0; i < 6; i++) {
      if (this[i] !== other[i]) {
        return false;
      }
    }
    return true;
  };

  /**
   * Multiplica dos transformaciones entre sí, combinándolas.
   * No modifica las transformaciones originales.  Asigna el resultado al argumento dest si se proporciona y lo devuelve.  En caso contrario, devuelve una nueva transformación.
   * @method mult
   * @static
   * @param {p5.Transform2D|Array.<number>} t1
   * @param {p5.Transform2D|Array.<number>} t2
   * @param {p5.Transform2D} [dest]
   * @return {p5.Transform2D}
   */
  p5.Transform2D.mult = function(t1, t2, dest) {
    dest = dest || new p5.Transform2D();

    // Capturar los valores de las matrices originales en variables locales, en caso de que una de
    // ellas sea la que estamos mutando.
    var t1_0, t1_1, t1_2, t1_3, t1_4, t1_5;
    t1_0 = t1[0];
    t1_1 = t1[1];
    t1_2 = t1[2];
    t1_3 = t1[3];
    t1_4 = t1[4];
    t1_5 = t1[5];

    var t2_0, t2_1, t2_2, t2_3, t2_4, t2_5;
    t2_0 = t2[0];
    t2_1 = t2[1];
    t2_2 = t2[2];
    t2_3 = t2[3];
    t2_4 = t2[4];
    t2_5 = t2[5];

    dest[0] = t1_0*t2_0 + t1_1*t2_3;
    dest[1] = t1_0*t2_1 + t1_1*t2_4;
    dest[2] = t1_0*t2_2 + t1_1*t2_5 + t1_2;

    dest[3] = t1_3*t2_0 + t1_4*t2_3;
    dest[4] = t1_3*t2_1 + t1_4*t2_4;
    dest[5] = t1_3*t2_2 + t1_4*t2_5 + t1_5;

    return dest;
  };

  /**
   * Multiplica esta transformación por otra, combinándolas.
   * Modifica esta transformación y la devuelve.
   * @method mult
   * @param {p5.Transform2D|Float32Array|Array.<number>} other
   * @return {p5.Transform2D}
   */
  p5.Transform2D.prototype.mult = function(other) {
    return p5.Transform2D.mult(this, other, this);
  };

  /**
   * Modifica esta transformación, traduciéndola en una cantidad determinada.
   * Devuelve esta transformación.
   * @method translate
   * @return {p5.Transform2D}
   * @example
   *     // Dos formas diferentes de llamar a este método.
   *     var t = new p5.Transform();
   *     // 1. Dos números
   *     t.translate(x, y);
   *     // 2. Un vector
   *     t.translate(new p5.Vector(x, y));
   */
  p5.Transform2D.prototype.translate = function(arg0, arg1) {
    var x, y;
    if (arg0 instanceof p5.Vector) {
      x = arg0.x;
      y = arg0.y;
    } else if (typeof arg0 === 'number' && typeof arg1 === 'number') {
      x = arg0;
      y = arg1;
    } else {
      var args = '';
      for (var i = 0; i < arguments.length; i++) {
        args += arguments[i] + ', ';
      }
      throw new TypeError('Invalid arguments to Transform2D.translate: ' + args);
    }
    return p5.Transform2D.mult([
      1, 0, x,
      0, 1, y
    ], this, this);
  };

  /**
   * Recupera la traducción resuelta de esta transformación.
   * @method getTranslation
   * @return {p5.Vector}
   */
  p5.Transform2D.prototype.getTranslation = function() {
    return new p5.Vector(this[2], this[5]);
  };

  /**
   * Modifica esta transformación, escalándola en una cantidad determinada.
   * Devuelve esta transformación.
   * @method scale
   * @return {p5.Transform2D}
   * @example
   *     // Tres formas diferentes de llamar a este método.
   *     var t = new p5.Transform();
   *     // 1. Un valor escalar
   *     t.scale(uniformScale);
   *     // 1. Dos valores escalares
   *     t.scale(scaleX, scaleY);
   *     // 2. Un vector
   *     t.translate(new p5.Vector(scaleX, scaleY));
   */
  p5.Transform2D.prototype.scale = function(arg0, arg1) {
    var sx, sy;
    if (arg0 instanceof p5.Vector) {
      sx = arg0.x;
      sy = arg0.y;
    } else if (typeof arg0 === 'number' && typeof arg1 === 'number') {
      sx = arg0;
      sy = arg1;
    } else if (typeof arg0 === 'number') {
      sx = arg0;
      sy = arg0;
    } else {
      throw new TypeError('Invalid arguments to Transform2D.scale: ' + arguments);
    }
    return p5.Transform2D.mult([
      sx, 0, 0,
      0, sy, 0
    ], this, this);
  };

  /**
   * Recupera el vector de escala de esta transformación.
   * @method getScale
   * @return {p5.Vector}
   */
  p5.Transform2D.prototype.getScale = function() {
    var a = this[0], b = this[1],
        c = this[3], d = this[4];
    return new p5.Vector(
      sign(a) * Math.sqrt(a*a + b*b),
      sign(d) * Math.sqrt(c*c + d*d)
    );
  };

  /*
   * Devuelve -1, 0 o 1 dependiendo de si un número es negativo, cero o positivo.
   */
  function sign(x) {
    x = +x; // convert to a number
    if (x === 0 || isNaN(x)) {
      return Number(x);
    }
    return x > 0 ? 1 : -1;
  }

  /**
   * Modifica esta transformación, girándola una cierta cantidad.
   * @method rotate
   * @param {number} radians
   * @return {p5.Transform2D}
   */
  p5.Transform2D.prototype.rotate = function(radians) {
    // Clockwise!
    if (typeof radians !== 'number') {
      throw new TypeError('Invalid arguments to Transform2D.rotate: ' + arguments);
    }
    var sinR = Math.sin(radians);
    var cosR = Math.cos(radians);
    return p5.Transform2D.mult([
      cosR, -sinR, 0,
      sinR, cosR, 0
    ], this, this);
  };

  /**
   * Recupera el ángulo de esta transformación en radianes.
   * @method getRotation
   * @return {number}
   */
  p5.Transform2D.prototype.getRotation = function() {
    // ver http://math.stackexchange.com/a/13165
    return Math.atan2(-this[1], this[0]);
  };

  /**
   * Aplica una matriz de transformación 2D (usando coordenadas homogéneas, por tanto 3x3) a un Vector2 (<x, y, 1>) y devuelve un nuevo vector2.
   * @method transform
   * @for p5.Vector
   * @static
   * @param {p5.Vector} v
   * @param {p5.Transform2D} t
   * @return {p5.Vector} un nuevo vector
   */
  p5.Vector.transform = function(v, t) {
    return v.copy().transform(t);
  };

  /**
   * Transforma este vector por una matriz de transformación 2D.
   * @method transform
   * @for p5.Vector
   * @param {p5.Transform2D} transform
   * @return {p5.Vector} this, after the change
   */
  p5.Vector.prototype.transform = function(transform) {
    // Nota: ¡Hacemos mucha trampa aquí ya que esto es sólo 2D!
    // Utiliza un método diferente si buscas una verdadera multiplicación de matrices.
    var x = this.x;
    var y = this.y;
    this.x = transform[0]*x + transform[1]*y + transform[2];
    this.y = transform[3]*x + transform[4]*y + transform[5];
    return this;
  };

}));
