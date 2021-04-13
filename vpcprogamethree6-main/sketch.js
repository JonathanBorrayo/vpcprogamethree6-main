var dog,sadDog,happyDog, database;
var foodS,foodStock;
var fedTime,lastFed;
var feed,addFood;
var foodObj;

function preload(){
sadDog=loadImage("Perro.png");
happyDog=loadImage("perro feliz.png");
}

function setup() {
  database=firebase.database();
  createCanvas(1000,400);

  foodObj = new Food();

  foodStock=database.ref('Comida');
  foodStock.on("value",readStock);
  
  dog=createSprite(800,200,150,150);
  dog.addImage(sadDog);
  dog.scale=0.15;
  
  feed=createButton("Alimentar al perro");
  feed.position(700,95);
  feed.mousePressed(feedDog);

  addFood=createButton("Añadir comida");
  addFood.position(800,95);
  addFood.mousePressed(addFoods);

}

function draw() {
  background(46,139,87);
  foodObj.display();

  fedTime=database.ref('FeedTime');
  fedTime.on("value",function(data){
    lastFed=data.val();
  });
 
  fill(255,255,254);
  textSize(15);
  if(lastFed>=12){
    text("Última alimentación : "+ lastFed%12 + " PM", 350,30);
   }else if(lastFed==0){
     text("Última alimentación : 12 AM",350,30);
   }else{
     text("Última alimentación : "+ lastFed + " AM", 350,30);
   }
 
  drawSprites();
}

//función para leer las reservas de comida
function readStock(data){
  foodS=data.val();
  foodObj.updateFoodStock(foodS);
}


//función para actualizar las reservas de comida y la última hora de alimentación
function feedDog(){
  dog.addImage(perrofeliz);
  
  var food_stock_val = foodObj.getFoodStock();
  if(food_stock_val <= 0){
      foodObj.updateFoodStock(food_stock_val *0);
  }else{
      foodObj.updateFoodStock(food_stock_val -1);
  }
  
  database.ref('/').update({
    Food:foodObj.getFoodStock(),
    FeedTime:hour()
  })
}

//función para añadir comida a las reservas
function addFoods(){
  foodS++;
  database.ref('/').update({
    Food:foodS
  })
}
