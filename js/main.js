// Prepare variables.
var cropList;

var svgWidth = 1080;
var svgMinWidth = 300;
var svgHeight = 480;

var width = svgWidth - 48;
var height = (svgHeight - 56) / 2;
var barPadding = 4;
var paddingLeft = 8;
var barWidth = width / seasons[options.season].crops.length - barPadding;
var miniBar = 8;
var barOffsetX = 29;
var barOffsetY = 40;
var graphDescription = "Profit";

// Prepare web elements.
var svg = d3.select("div.graph")
	.append("svg")
	.attr("width", svgWidth)
	.attr("height", svgHeight)
	.style("background-color", "#333333")
	.style("border-radius", "8px");

var tooltip = d3.select("body")
	.append("div")
	.style("position", "absolute")
	.style("z-index", 10)
	.style("visibility", "hidden")
	.style("background", "rgb(0, 0, 0)")
	.style("background", "rgba(0, 0, 0, 0.75)")
	.style("padding", "8px")
	.style("border-radius", "8px")
	.style("border", "2px solid black");

var gAxis = svg.append("g");
var gTitle = svg.append("g");
var gProfit = svg.append("g");
var gSeedLoss = svg.append("g");
var gFertLoss = svg.append("g");
var gIcons = svg.append("g");
var gTooltips = svg.append("g");

var axisY;
var barsProfit;
var barsSeed;
var barsFert;
var imgIcons;
var barsTooltips;
var options;
var MAX_INT = Number.MAX_SAFE_INTEGER || Number.MAX_VALUE;

// Festival days when shops are closed and planting is not possible
var festivalDaysBySeason = {
    0: [13, 24],  // Spring: Egg Festival, Flower Dance
    1: [11, 28],  // Summer: Luau, Dance of the Moonlight Jellies
    2: [16, 27],  // Fall: Stardew Valley Fair, Spirit's Eve
    3: [8, 25]    // Winter: Festival of Ice, Feast of the Winter Star
};

/*
 * Formats a specified number, adding separators for thousands.
 * @param num The number to format.
 * @return Formatted string.
 */
function formatNumber(num) {
    num = num.toFixed(2) + '';
    x = num.split('.');
    x1 = x[0];
    x2 = x.length > 1 ? '.' + x[1] : '';
    var rgx = /(\d+)(\d{3})/;
    while (rgx.test(x1)) {
        x1 = x1.replace(rgx, '$1' + ',' + '$2');
    }
    return x1 + x2;
}

/*
 * Calculates the maximum number of harvests for a crop, specified days, season, etc.
 * @param cropID The ID of the crop to calculate. This corresponds to the crop number of the selected season.
 * @return Number of harvests for the specified crop.
 */
function harvests(cropID) {
	var crop = seasons[options.season].crops[cropID];
	var fertilizer = fertilizers[options.fertilizer];
	// Tea blooms every day for the last 7 days of a season
	var isTea = crop.name == "Tea Leaves";

	// if the crop is NOT cross season, remove 28 extra days for each extra season
	var remainingDays = options.days - 28;
	if (options.crossSeason && options.season != 4) {
        var i = options.season + 1;
        if (i >= 4)
            i = 0;
		for (var j = 0; j < seasons[i].crops.length; j++) {
			var seasonCrop = seasons[i].crops[j];
			if (crop.name == seasonCrop.name) {
				remainingDays += 28;
				break;
			}
		}
	}
    else {
        remainingDays = options.days;
    }

	// console.log("=== " + crop.name + " ===");

	var harvests = 0;
	var day = 1;

	if (options.skills.agri)
		day += Math.floor(crop.growth.initial * (fertilizer.growth - 0.1));
	else
		day += Math.floor(crop.growth.initial * fertilizer.growth);

	if (day <= remainingDays && (!isTea || ((day-1) % 28 + 1) > 21))
		harvests++;

	while (day <= remainingDays) {
		if (crop.growth.regrow > 0) {
			// console.log("Harvest on day: " + day);
			day += crop.growth.regrow;
		}
		else {
			// console.log("Harvest on day: " + day);
			if (options.skills.agri)
				day += Math.floor(crop.growth.initial * (fertilizer.growth - 0.1));
			else
				day += Math.floor(crop.growth.initial * fertilizer.growth);
		}

		if (day <= remainingDays && (!isTea || ((day-1) % 28 + 1) > 21))
			harvests++;
	}

	// console.log("Harvests: " + harvests);
	return harvests;
}

/*
 * Calculates the minimum cost of a single packet of seeds.
 * @param crop The crop object, containing all the crop data.
 * @return The minimum cost of a packet of seeds, taking options into account.
 */
function minSeedCost(crop) {
	var minSeedCost = Infinity;

	if (crop.seeds.pierre != 0 && options.seeds.pierre && crop.seeds.pierre < minSeedCost)
		minSeedCost = crop.seeds.pierre;
	if (crop.seeds.joja != 0 && options.seeds.joja && crop.seeds.joja < minSeedCost)
		minSeedCost = crop.seeds.joja;
	if (crop.seeds.special != 0 && options.seeds.special && crop.seeds.special < minSeedCost)
		minSeedCost = crop.seeds.special;
    if (minSeedCost == Infinity)
        minSeedCost = 0;
	
	return minSeedCost;
}

/*
 * Calculates the number of crops planted.
 * @param crop The crop object, containing all the crop data.
 * @return The number of crops planted, taking the desired number planted and the max seed money into account.
 */
function planted(crop) {
	if (options.buySeed && options.maxSeedMoney !== 0) {
		return Math.min(options.planted, Math.floor(options.maxSeedMoney / minSeedCost(crop)));
	} else {
		return options.planted;
	}
}

/*
 * Removes Number of crops from a quality for specified scenarios. Use this function to take produce away used as seeds or consumed for artisan goods.
 * This assumes lowest quality will be consumed first..
 *
 * @param crop Crop Data
 * @param cropsLeft Crops left unused if not selling raw.
 * @param extra Extra Crops produced
 * @return [countRegular, countSilver, countGold, countIridium] Number of produce for each quality.
 */
function removeCropQuality(removeCrop,countRegular, countSilver, countGold, countIridium){
	if(removeCrop != 0){
		// used = (totalCrops + (extra * crop.produce.extra)) - cropsLeft //something wrong with selling excess here
		if (countRegular - removeCrop < 0){
			removeCrop -= countRegular;
			countRegular = 0;
			if (countSilver - removeCrop < 0 ){
				removeCrop -= countSilver;
				countSilver = 0;
				if (countGold - removeCrop < 0){
					removeCrop -= countGold;
					countSilver = 0;
					if (countIridium - removeCrop < 0 ){
						removeCrop -= countIridium;
						countIridium = 0;
					} else {
						countIridium -= removeCrop;
						removeCrop = 0;
					}
				} else {
					countGold -= removeCrop;
					removeCrop = 0;
				}
			} else {
				countSilver -= removeCrop;
				removeCrop = 0;
			}
		} else {
			countRegular -= removeCrop;
			removeCrop = 0;
		}
	}

	return [countRegular, countSilver, countGold, countIridium];
}

/*
 * Calculates netIncome based on Quality of Raw produce and Till Skill.
 *
 * @param crop Crop Data
 * @param countRegular Number of crops at regular quality.
 * @param countSilver Number of crops at silver quality.
 * @param countGold Number of crops at gold quality.
 * @param countIridium Number of crops at iridium quality.
 * @return netIncome Total Net Income based only on raw produce by quality including till skill.
 */
function rawNetIncome(crop, countRegular, countSilver, countGold, countIridium){
	netIncome = 0;
	
	netIncome += crop.produce.price * countRegular;
	netIncome += Math.trunc(crop.produce.price * 1.25) * countSilver;
	netIncome += Math.trunc(crop.produce.price * 1.5) * countGold;
	netIncome += crop.produce.price * 2 * countIridium;
	
	if (options.skills.till) {
		netIncome *= 1.1;
	}

	return netIncome;
}

/*
 * Calculates the number of crops to convert to seed for replant.
 * @param crop The crop object, containing all the crop data.
 * @param num_planted The number of crops planted.
 * @return The number of crops planted, taking the desired number planted and the max seed money into account.
 */
function convertToSeeds(crop,num_planted, isTea,isCoffee){
	var forSeeds = 0;
	if (options.replant && !isTea) {
		if (isCoffee && options.nextyear) {
			forSeeds = num_planted;
		} 
		else if (crop.growth.regrow > 0 && options.nextyear) {
			forSeeds = num_planted * 0.5;
		} 
		else if (crop.growth.regrow == 0) {
			forSeeds = num_planted * crop.harvests * 0.5;
			if(!options.nextyear && forSeeds >= 1) 
				forSeeds -= num_planted * 0.5;
		}
	}
	return forSeeds;
}

/*
 * Calculates the keg modifier for the crop.
 * @param crop The crop object, containing all the crop data.
 * @return The keg modifier.
 */
function getKegModifier(crop) {
	if (options.skills.arti ){
		result = crop.produce.kegType == "Wine" ? 4.2 : 3.15;
	}else{
		result = crop.produce.kegType == "Wine" ? 3 : 2.25;
	}
    return result;
}

/*
 * Calculates the cask modifier for the crop.
 * @param crop The crop object, containing all the crop data.
 * @return The cask modifier.
 */
function getCaskModifier() {
    switch (options.aging) {
        case 1: return options.skills.arti ? 1.75 : 1.25;
        case 2: return options.skills.arti ? 2.145 : 1.5;
        case 3: return options.skills.arti ? 2.8 : 2;
        default: return options.skills.arti ? 1.4 : 1;
    }
}

/*
 * Calculates the dehydrator modifier for 5 crops.
 * @param crop The crop object, containing all the crop data.
 * @return The dehydrator modifier.
 */
function getDehydratorModifier(crop) {
	var modifier = 7.5 * crop.produce.price + 25;
	switch(crop.produce.dehydratorType){
		case "Dried Fruit":
			modifier = options.skills.arti ?  10.5 * crop.produce.price + 35 : modifier;
			break;
		default: //We aren't calculating Mushrooms thus all else would be Grapes/Rasins
			modifier = options.skills.arti ? 840 : 600;
	}
    return modifier;
}

/*
 * Calculates the mill modifier for 3 crops.
 * @param crop The crop object, containing all the crop data.
 * @return The mill modifier.
 */
function getMillModifier(crop) {
	var modifier = 1;
	switch(crop.produce.millType){
		case "Rice":
			modifier = 100;
			break;
		case "Sugar":
			modifier = 50 * 3;
			break;
		default: // That leaves Wheat Flour
			modifier = 50
	}
    return modifier;
}


/*
 * Converts a relative day (1 = first day of calculation period) to absolute season day.
 * @param relDay Relative day within calculation period.
 * @return Absolute day (1-indexed within the overall period starting from season day 1).
 */
function relToAbsDay(relDay) {
    if (options.season == 4) return relDay;
    var offset = options.crossSeason ? 56 - options.days : 28 - options.days;
    return offset + relDay;
}

/*
 * Checks if an absolute season day is a shop-closed festival day.
 * @param absDay Absolute day (1-indexed, within 1-56 range for cross-season).
 * @return True if the day is a festival day.
 */
function isFestivalDay(absDay) {
    if (options.season == 4) return false;
    var dayOfSeason, seasonIdx;
    if (absDay <= 28) {
        dayOfSeason = absDay;
        seasonIdx = options.season;
    } else {
        dayOfSeason = absDay - 28;
        seasonIdx = (options.season + 1) % 4;
    }
    var festivals = festivalDaysBySeason[seasonIdx];
    return festivals ? festivals.indexOf(dayOfSeason) !== -1 : false;
}

/*
 * Returns the next relative day that is not a festival/shop-closed day, at or after relDay.
 * Used for the initial planting (seeds already owned — only festivals block planting).
 * @param relDay Starting relative day.
 * @return Same or later relative day that is open for planting.
 */
function nextShopOpenDay(relDay) {
    while (isFestivalDay(relToAbsDay(relDay))) relDay++;
    return relDay;
}

/*
 * Returns true if seeds for this crop can be purchased on the given absolute day.
 * Accounts for festival closures, Pierre's Wednesday closure, and whether Pierre/Joja
 * actually sell this crop (special-only crops like Strawberry return false).
 * @param crop The crop object.
 * @param absDay Absolute season day.
 * @return True if at least one checked seed source is available on this day.
 */
function canBuySeedsOnDay(crop, absDay) {
    if (isFestivalDay(absDay)) return false;
    var wednesday = (absDay % 7 === 3);
    // Pierre sells this crop, Pierre is checked, and Pierre is open (closed Wednesdays)
    if (crop.seeds.pierre > 0 && options.seeds.pierre && !wednesday) return true;
    // Joja sells this crop, Joja is checked (open every non-festival day)
    if (crop.seeds.joja > 0 && options.seeds.joja) return true;
    // Special vendor (Oasis, Island Trader, Travelling Cart, etc.) — open every non-festival day.
    // Exception: festival-exclusive vendors like "Egg Festival" can't be restocked after the event.
    if (crop.seeds.special > 0 && options.seeds.special) {
        var loc = crop.seeds.specialLoc || "";
        if (loc.indexOf("Festival") === -1) return true;
    }
    return false;
}

/*
 * Returns the next relative day at or after relDay where seeds for this crop can be bought.
 * If no such day exists within the calculation period, returns a day beyond totalDays.
 * @param crop The crop object.
 * @param relDay Starting relative day.
 * @return Relative day when seeds can next be purchased.
 */
function nextSeedBuyDay(crop, relDay) {
    var maxDay = parseInt(options.days) + 1;
    while (relDay <= maxDay && !canBuySeedsOnDay(crop, relToAbsDay(relDay))) relDay++;
    return relDay;
}

/*
 * Calculates the number of growth days for a crop (from planting to first harvest).
 * @param crop The crop object.
 * @return Number of days to first harvest.
 */
function cropGrowDays(crop) {
    var fert = fertilizers[options.fertilizer];
    if (options.skills.agri)
        return Math.floor(crop.growth.initial * (fert.growth - 0.1));
    else
        return Math.floor(crop.growth.initial * fert.growth);
}

/*
 * Calculates the sell revenue from a single harvest of numPlanted crops.
 * Uses the currently selected produce type and skills.
 * @param crop The crop object.
 * @param numPlanted Number of plants harvested.
 * @return Revenue in gold.
 */
function singleHarvestRevenue(crop, numPlanted) {
    var isTea = crop.name === "Tea Leaves";
    var fert = fertilizers[options.fertilizer];
    var lvl = crop.isWildseed ? options.foragingLevel : options.level;
    var prob = crop.isWildseed
        ? PredictForaging(options.foragingLevel, options.skills.botanist)
        : Probability(lvl + options.foodLevel, fert.ratio, isTea);

    var total = numPlanted * (1 + crop.produce.extraPerc * crop.produce.extra);
    var useRaw = false;
    switch (options.produce) {
        case 1: if (!crop.produce.jarType)       useRaw = true; break;
        case 2: if (!crop.produce.kegType)        useRaw = true; break;
        case 4: if (!crop.produce.dehydratorType) useRaw = true; break;
        case 5: if (!crop.produce.millType)       useRaw = true; break;
    }

    if (options.produce === 0 || useRaw) {
        if (useRaw && !options.sellRaw) return 0;
        return rawNetIncome(crop,
            total * prob.regular, total * prob.silver,
            total * prob.gold, total * prob.iridium);
    }
    if (options.produce === 1)
        return total * (options.skills.arti ? (crop.produce.price*2+50)*1.4 : crop.produce.price*2+50);
    if (options.produce === 2) {
        if (crop.produce.kegType === "Pale Ale") return total * crop.produce.keg;
        var km = getKegModifier(crop), cm = getCaskModifier();
        return total * (options.aging !== 0 ? crop.produce.price * km * cm : crop.produce.price * km);
    }
    if (options.produce === 3) return 2 * total * crop.seeds.sell;
    if (options.produce === 4) return Math.floor(total / 5) * getDehydratorModifier(crop);
    if (options.produce === 5) return total * getMillModifier(crop);
    return 0;
}

/*
 * Returns the fertilizer cost per tile for a single planting.
 */
function fertCostPerPlant() {
    if (!options.buyFert) return 0;
    if (options.fertilizer === 4 && options.fertilizerSource === 1)
        return fertilizers[4].alternate_cost;
    return fertilizers[options.fertilizer].cost;
}

/*
 * Simulates compound reinvestment planting cycles for a crop in Expansion Mode.
 * @param crop The crop object (must have .id set).
 * @return Array of cycle event objects: { type, day, absDay, crops, cost, revenue, balance, closedNote }
 */
function calcExpansionCycles(crop) {
    var cycles = [];
    var seedCost = minSeedCost(crop);
    var fertCost = fertCostPerPlant();
    var costPerTile = seedCost + fertCost;
    // Cycle 1 always plants options.planted tiles; later cycles can grow up to expansionCap.
    var initialTiles = parseInt(options.planted);
    var capTiles = parseInt(options.expansionCap) || 0; // 0 = no cap
    var totalDays = parseInt(options.days);
    var isTea = crop.name === "Tea Leaves";
    var growDays = cropGrowDays(crop);

    // Starting capital: exactly enough to plant the initial batch.
    var money = initialTiles * costPerTile;
    var isFirstPlanting = true;

    function numCanPlant() {
        if (isFirstPlanting) return initialTiles;
        if (costPerTile === 0) return capTiles > 0 ? capTiles : initialTiles;
        var affordable = Math.floor(money / costPerTile);
        return capTiles > 0 ? Math.min(capTiles, affordable) : affordable;
    }

    if (crop.growth.regrow > 0) {
        var plantDay1 = nextShopOpenDay(1);
        if (plantDay1 > totalDays) return cycles;
        if (plantDay1 + growDays > totalDays) return cycles;

        var n0 = initialTiles;
        var cost0 = n0 * costPerTile;
        money -= cost0;
        isFirstPlanting = false;

        if (isTea) {
            // Tea blooms every day in the last 7 days of each 28-day period — no expansion
            cycles.push({
                type: 'plant', day: plantDay1, absDay: relToAbsDay(plantDay1),
                crops: n0, cost: cost0, revenue: 0, balance: money, batchId: 0,
                closedNote: plantDay1 > 1 ? "delayed (festival)" : ""
            });

            for (var d = plantDay1 + growDays; d <= totalDays; d++) {
                var absD = relToAbsDay(d);
                var dayInSeason = ((absD - 1) % 28) + 1;
                if (dayInSeason > 21) {
                    var rev = singleHarvestRevenue(crop, n0);
                    money += rev;
                    cycles.push({
                        type: 'harvest', isRegrow: true, day: d, absDay: absD,
                        crops: n0, cost: 0, revenue: rev, balance: money, batchId: 0,
                        closedNote: ""
                    });
                }
            }
        } else {
            // Multi-batch regrowing: after each harvest, try to plant additional tiles.
            // Each new planting is an independent batch; all batches remain alive until end of season.
            var regrowDays = crop.growth.regrow;
            var allEvents = [];
            var batches = []; // { tiles, nextHarvestDay, isFirstHarvest, batchId }
            var batchCounter = 0;
            var peakTiles = n0;

            allEvents.push({
                type: 'plant', day: plantDay1, absDay: relToAbsDay(plantDay1),
                crops: n0, cost: cost0, revenue: 0, balance: money, batchId: batchCounter,
                closedNote: plantDay1 > 1 ? "delayed (festival)" : ""
            });
            batches.push({ tiles: n0, nextHarvestDay: plantDay1 + growDays, isFirstHarvest: true, batchId: batchCounter });
            batchCounter++;

            while (batches.length > 0) {
                // Find earliest harvest day across all active batches
                var minDay = batches.reduce(function(m, b) { return Math.min(m, b.nextHarvestDay); }, Infinity);
                if (minDay > totalDays) break;

                // Harvest all batches due on minDay
                var survivingBatches = [];
                for (var bi = 0; bi < batches.length; bi++) {
                    var b = batches[bi];
                    if (b.nextHarvestDay === minDay) {
                        var rev = singleHarvestRevenue(crop, b.tiles);
                        money += rev;
                        allEvents.push({
                            type: 'harvest', isRegrow: !b.isFirstHarvest,
                            day: minDay, absDay: relToAbsDay(minDay),
                            crops: b.tiles, cost: 0, revenue: rev, balance: money, batchId: b.batchId,
                            closedNote: ""
                        });
                        var nextHDay = minDay + regrowDays;
                        if (nextHDay <= totalDays) {
                            survivingBatches.push({ tiles: b.tiles, nextHarvestDay: nextHDay, isFirstHarvest: false, batchId: b.batchId });
                        }
                    } else {
                        survivingBatches.push(b);
                    }
                }
                batches = survivingBatches;

                // After harvesting, try to plant new tiles with accumulated money
                var totalActiveTiles = batches.reduce(function(s, b) { return s + b.tiles; }, 0);
                var roomUnderCap = capTiles > 0 ? Math.max(0, capTiles - totalActiveTiles) : Infinity;

                if (roomUnderCap > 0) {
                    // Need to buy seeds for new batch — check Pierre/Joja availability
                    var newPlantDay = nextSeedBuyDay(crop, minDay);
                    if (newPlantDay <= totalDays && newPlantDay + growDays <= totalDays) {
                        var newTiles;
                        if (costPerTile === 0) {
                            newTiles = isFinite(roomUnderCap) ? roomUnderCap : 0;
                        } else {
                            newTiles = Math.min(
                                isFinite(roomUnderCap) ? roomUnderCap : Number.MAX_SAFE_INTEGER,
                                Math.floor(money / costPerTile)
                            );
                        }
                        if (newTiles > 0) {
                            var newCost = newTiles * costPerTile;
                            money -= newCost;
                            var newClosedNote = newPlantDay > minDay
                                ? (isFestivalDay(relToAbsDay(minDay)) ? "delayed (festival)" : "delayed (shop closed)")
                                : "";
                            allEvents.push({
                                type: 'plant', day: newPlantDay, absDay: relToAbsDay(newPlantDay),
                                crops: newTiles, cost: newCost, revenue: 0, balance: money, batchId: batchCounter,
                                closedNote: newClosedNote
                            });
                            batches.push({ tiles: newTiles, nextHarvestDay: newPlantDay + growDays, isFirstHarvest: true, batchId: batchCounter });
                            batchCounter++;
                            // Track peak: sum of all now-active batches
                            var runningTotal = batches.reduce(function(s, b) { return s + b.tiles; }, 0);
                            if (runningTotal > peakTiles) peakTiles = runningTotal;
                        }
                    }
                }
            }

            // Sort: ascending day; on same day, harvest before plant (harvest funds the plant)
            allEvents.sort(function(a, b) {
                if (a.day !== b.day) return a.day - b.day;
                if (a.type === 'harvest' && b.type === 'plant') return -1;
                if (a.type === 'plant' && b.type === 'harvest') return 1;
                return 0;
            });

            allEvents.peakTiles = peakTiles;
            cycles = allEvents;
        }
    } else {
        // Non-regrowing crop: plant → harvest → reinvest → repeat, expanding tiles each cycle.
        var rawPlantDay = 1;
        // First planting: seeds already owned, only skip festival days
        var plantRelDay = nextShopOpenDay(rawPlantDay);
        var cycleBatchId = 0;
        while (plantRelDay <= totalDays) {
            var harvestRelDay = plantRelDay + growDays;
            if (harvestRelDay > totalDays) break;

            var n = numCanPlant();
            if (n <= 0) break;

            var plantAbsDay = relToAbsDay(plantRelDay);
            var closedNote = plantRelDay > rawPlantDay ? (isFestivalDay(relToAbsDay(rawPlantDay)) ? "delayed (festival)" : "delayed (shop closed)") : "";
            var cost = n * costPerTile;
            money -= cost;
            isFirstPlanting = false;

            cycles.push({
                type: 'plant', day: plantRelDay, absDay: plantAbsDay,
                crops: n, cost: cost, revenue: 0, balance: money, batchId: cycleBatchId,
                closedNote: closedNote
            });

            var rev = singleHarvestRevenue(crop, n);
            money += rev;

            cycles.push({
                type: 'harvest', day: harvestRelDay, absDay: relToAbsDay(harvestRelDay),
                crops: n, cost: 0, revenue: rev, balance: money, batchId: cycleBatchId,
                closedNote: ""
            });

            cycleBatchId++;
            rawPlantDay = harvestRelDay;
            // Subsequent plantings: need to actually buy seeds — check Pierre/Joja availability
            plantRelDay = nextSeedBuyDay(crop, rawPlantDay);
        }
    }

    return cycles;
}

/*
 * Returns the total net profit from all expansion cycles for a crop.
 * @param crop The crop object.
 * @return Net profit (revenue - costs).
 */
function expansionTotalProfit(crop) {
    var cycles = calcExpansionCycles(crop);
    if (!cycles.length) return 0;
    // Net profit = total revenue across all cycles minus total seed/fert costs
    return cycles.reduce(function(acc, c) { return acc + c.revenue - c.cost; }, 0);
}

/*
 * Calculates the profit for a specified crop.
 * @param crop The crop object, containing all the crop data.
 * @return The total profit.
 */
function profit(crop) {
    profitData = {}
	var num_planted = planted(crop);
	var fertilizer = fertilizers[options.fertilizer];
	var produce = options.produce;
	var isTea = crop.name == "Tea Leaves";
	var isCoffee = crop.name == "Coffee Bean";

    var useLevel = options.level;
    if (crop.isWildseed)
        useLevel = options.foragingLevel;

	const probability = (crop.isWildseed) ? PredictForaging(options.foragingLevel,options.skills.botanist) : Probability(useLevel+options.foodLevel,fertilizer.ratio,isTea);

	var netIncome = 0;
	var netExpenses = 0;
	var totalProfit = 0;
	var totalReturnOnInvestment = 0;
	var averageReturnOnInvestment = 0;
	crop.produce.regular = 0
	crop.produce.silver = 0
	crop.produce.gold = 0
	crop.produce.iridium = 0
	
	//Skip keg/jar calculations for ineligible crops (where corp.produce.jar or crop.produce.keg = 0)
	
	var userawproduce = false;

	switch(produce) {
		case 1: 
			if(crop.produce.jarType == null) userawproduce = true;
			break;
		case 2:
			if(crop.produce.kegType == null) userawproduce = true;
			break;	
		case 4:
			if(crop.produce.dehydratorType == null) userawproduce = true;
			break;
		case 5:
			if(crop.produce.millType == null) userawproduce = true;
			break;
	}
	
	//Determine how many produce will be used for seeds.
	var forSeeds = convertToSeeds(crop,num_planted,isTea,isCoffee)
	var total_harvest = 0;
	var total_crops = 0;
	var extra = {};

	if (options.predictionModel){
		extra = PredictExtraHarvest(crop,num_planted);
		crop.produce.extraProduced = extra.total * crop.produce.extra;

		total_harvest = num_planted * 1.0
		total_crops = (total_harvest * crop.harvests) + (extra.total * crop.produce.extra)
	} else {
		extra.total = (crop.produce.extraPerc * crop.produce.extra) * crop.harvests;
		crop.produce.extraProduced = Math.floor(extra.total);

		total_harvest = num_planted * 1.0 + num_planted * crop.produce.extraPerc * crop.produce.extra;
		total_crops = total_harvest * crop.harvests;
	}

	// Determine income
	/*
	* 	Produce Types:
	*	0 = Raw
	*	1 = Jar
	*	2 = Keg
	*	3 = Seeds
	*	4 = Dehydrator
	*	5 = Mill
	*/
	if (produce != 3 && produce != 5 || userawproduce) {
        if (userawproduce && !options.sellRaw) {
            netIncome = 0;
        }
        else {
			//First we need to find crop quality for all crops
			//Then remove crops repurposed for seeds (take away from regular quality first)
			//If we're working with an artisan then we will look at excess (by time) to take away qualities
            var countRegular = 0
            var countSilver = 0
            var countGold = 0
            var countIridium = 0

			if(options.predictionModel){
				var [countRegular, countSilver, countGold, countIridium] = CountCropQuality(crop,total_harvest,useLevel,fertilizer,extra.total);
	
			} else {
				countRegular 	= total_crops * probability.regular;
				countSilver 	= total_crops * probability.silver;
				countGold 		= total_crops * probability.gold;
				countIridium 	= total_crops * probability.iridium;
			}
			//Remove produce converted to Seed
			var [countRegular, countSilver, countGold, countIridium] = removeCropQuality(forSeeds,countRegular, countSilver, countGold, countIridium)	
			

            if (produce == 0 || userawproduce) {
				
				netIncome += rawNetIncome(crop, countRegular, countSilver, countGold, countIridium);

				crop.produce.regular = countRegular
				crop.produce.silver = countSilver
				crop.produce.gold = countGold
				crop.produce.iridium = countIridium
                profitData.quantitySold  = Math.floor(total_crops - forSeeds);
            }
            else if (produce == 1 || produce == 2 || produce == 4) {

                var usableCrops = 0;
				var usableCropsByHarvest = [];
				//extra isn't being accounted for by harvest
                if (produce != 4 || options.byHarvest) {
					if(options.predictionModel && crop.produce.extra > 0){
						if (extra.extraByHarvest.length >0 ){
							for (i in extra.extraByHarvest){ 
								usableCropsByHarvest[i] = Math.floor(total_harvest) + extra.extraByHarvest[i];
								if (options.replant && !isTea && crop.growth.regrow == 0)
									usableCropsByHarvest[i] -= num_planted * 0.5;
								usableCropsByHarvest[i] = Math.max(0, usableCropsByHarvest[i]);
							}
						}
					} else {
						usableCrops = Math.floor(total_harvest);
						if (options.replant && !isTea && crop.growth.regrow == 0)
							usableCrops -= num_planted * 0.5;
						usableCrops = Math.max(0, usableCrops);
					}
                }
                else {
                    usableCrops = Math.floor(total_crops - forSeeds);
                    usableCrops = Math.max(0, usableCrops);
                }

                var itemsMade = 0;
                var cropsLeft = 0;
                if (produce == 1 || produce == 2) {
					if(options.predictionModel && usableCropsByHarvest.length > 0){
						for (i in usableCropsByHarvest){
							itemsMade += Math.floor(usableCropsByHarvest[i]);
						}
					} else {
						itemsMade = usableCrops;
					}
                }
                else if (produce == 4) {
					if(options.predictionModel && usableCropsByHarvest.length > 0){
						for (i in usableCropsByHarvest){
							cropsLeft += Math.floor(usableCropsByHarvest[i] % 5);
							itemsMade += Math.floor(usableCropsByHarvest[i] / 5);
						}
					} else {
						cropsLeft = Math.floor(usableCrops % 5);
						itemsMade = Math.floor(usableCrops / 5);
					}
                }

                if (produce == 4 && options.equipment > 0 && options.byHarvest) {
					if(options.predictionModel && usableCropsByHarvest.length > 0){
						itemsMade = Math.min(options.equipment * crop.harvests, Math.floor(total_crops / 5))
						cropsLeft = total_crops - (itemsMade * 5)

					} else {
						cropsLeft += Math.max(0, itemsMade - options.equipment) * 5;
						itemsMade = Math.min(options.equipment, itemsMade);
					}
                }

                if (produce == 4 && options.byHarvest) {
					if(usableCropsByHarvest.length == 0){
						cropsLeft *= crop.harvests;
						itemsMade *= crop.harvests;
					}
                }
                if (options.nextyear && options.byHarvest) {
                    if (produce == 4) {
                        var itemsMadeNew = Math.max(0, Math.round((itemsMade * 5 - num_planted * 0.5) / 5));
                        cropsLeft += (itemsMade - itemsMadeNew) * 5;
                        itemsMade = itemsMadeNew;
                    }
                }

                if (options.equipment > 0) {
                    if (produce == 1 || produce == 2) {
						if(options.predictionModel && usableCropsByHarvest.length > 0){
							itemsMade = Math.min(options.equipment * crop.harvests, Math.floor(total_crops));
							cropsLeft = total_crops - itemsMade; 

						} else {
							cropsLeft += Math.max(0, itemsMade - options.equipment) * crop.harvests;
							itemsMade = Math.min(options.equipment, itemsMade) * crop.harvests;
						}
                    }
                    if (produce == 4 && !options.byHarvest) {
                        cropsLeft += Math.max(0, itemsMade - options.equipment) * 5;
                        itemsMade = Math.min(options.equipment, itemsMade);
                    }
                }
                else {
                    if (produce == 1 || produce == 2) {
						if(!options.predictionModel){
                        	itemsMade *= crop.harvests;
						}
                    }
                }

                if (options.nextyear) {
                    if (produce == 1 || produce == 2) {
                        cropsLeft += num_planted * 0.5;
                        itemsMade = Math.max(0, itemsMade - num_planted * 0.5);
                    }
                }

                if (options.sellExcess && cropsLeft > 0){
					//Remove produce used in artisan goods
					[countRegular, countSilver, countGold, countIridium] = removeCropQuality((total_crops - cropsLeft),countRegular, countSilver, countGold, countIridium);

					netIncome += rawNetIncome(crop, countRegular, countSilver, countGold, countIridium);
					crop.produce.regular 	= Math.round((countRegular + Number.EPSILON) * 100) / 100;
					crop.produce.silver 	= Math.round((countSilver + Number.EPSILON) * 100) / 100;
					crop.produce.gold 		= Math.round((countGold + Number.EPSILON) * 100) / 100;
					crop.produce.iridium 	= Math.round((countIridium + Number.EPSILON) * 100) / 100;
				}

                var kegModifier = getKegModifier(crop);
                var caskModifier = getCaskModifier();
                var dehydratorModifier = getDehydratorModifier(crop);
                if (options.produce == 1) {
                    netIncome += itemsMade * (options.skills.arti ? (crop.produce.price * 2 + 50) * 1.4 : crop.produce.price * 2 + 50);
                }
                else if (options.produce == 2) {
                    if (crop.produce.kegType == "Pale Ale") {
                        netIncome += itemsMade * crop.produce.keg;
                    }
                    else {
                        netIncome += itemsMade * (crop.produce.kegType != null && options.aging != "None" ? crop.produce.price * kegModifier * caskModifier : crop.produce.price * kegModifier);
                    }
                }
                else if (options.produce == 4) {
                    netIncome += crop.produce.dehydratorType != null ? itemsMade * dehydratorModifier : 0;
                }
        
                profitData.quantitySold = itemsMade;
                profitData.excessProduce = cropsLeft;
            }
        }
		
	}
    else if (produce == 3) {
        var items = total_crops - forSeeds;
        netIncome += 2 * items * crop.seeds.sell;
		profitData.quantitySold = Math.floor(2 * items);
    }
	else if (produce == 5) {
		var items = total_crops - forSeeds;
		var millModifier = getMillModifier(crop);
		netIncome += millModifier * items;
		profitData.quantitySold = items;
    }

	// Determine expenses
	if (options.buySeed) {
		netExpenses += crop.seedLoss;
		// console.log("Profit (After seeds): " + profit);
	}

	if (options.buyFert) {
		netExpenses += crop.fertLoss;
		// console.log("Profit (After fertilizer): " + profit);
	}

	// Determine total profit
	totalProfit = netIncome + netExpenses;
	// maxTotalProfit = maxNetIncome + netExpenses;
	// predTotalProfit = predNetIncome + netExpenses;
	if (netExpenses != 0) {
		totalReturnOnInvestment = 100 * ((totalProfit) / -netExpenses); // Calculate the return on investment and scale it to a % increase
		if (crop.growth.regrow == 0) {
			averageReturnOnInvestment = (totalReturnOnInvestment / crop.growth.initial);
		}
		else {
			averageReturnOnInvestment = (totalReturnOnInvestment / options.days);
		}
	}
	else {
		totalReturnOnInvestment = 0;
		averageReturnOnInvestment = 0;
	}

	profitData.totalReturnOnInvestment = totalReturnOnInvestment;
	profitData.averageReturnOnInvestment = averageReturnOnInvestment;
	profitData.netExpenses = netExpenses;
    profitData.profit = totalProfit;

    // profitData.maxProfit = maxTotalProfit;
	// profitData.predTotalProfit = predTotalProfit

    profitData.regular = probability.regular;
    profitData.silver = probability.silver;
    profitData.gold = probability.gold;
    profitData.iridium = probability.iridium;

	// console.log("Profit: " + profit);
	return profitData;
}

/*
 * Calculates the loss to profit when seeds are bought.
 * @param crop The crop object, containing all the crop data.
 * @return The total loss.
 */
function seedLoss(crop) {
	var harvests = crop.harvests;

    var loss = -minSeedCost(crop);

	if (crop.growth.regrow == 0 && harvests > 0 && !options.replant)
		loss = loss * harvests;

	return loss * planted(crop);
}

/*
 * Calculates the loss to profit when fertilizer is bought.
 *
 * Note that harvesting does not destroy fertilizer, so this is
 * independent of the number of harvests.
 *
 * @param crop The crop object, containing all the crop data.
 * @return The total loss.
 */
function fertLoss(crop) {
	var loss;
	if(options.fertilizer == 4 && options.fertilizerSource == 1)
		loss = -fertilizers[options.fertilizer].alternate_cost;
	else
		loss = -fertilizers[options.fertilizer].cost;
	return loss * planted(crop);
}

/*
 * Converts any value to the average per day value.
 * @param value The value to convert.
 * @return Value per day.
 */
function perDay(value) {
	return value / options.days;
}

/*
 * Performs filtering on a season's crop list, saving the new list to the cropList array.
 */
function fetchCrops() {
	cropList = [];

	var season = seasons[options.season];

	for (var i = 0; i < season.crops.length; i++) {
	    if ((options.seeds.pierre && season.crops[i].seeds.pierre != 0) ||
	    	(options.seeds.joja && season.crops[i].seeds.joja != 0) ||
    	    (options.seeds.special && season.crops[i].seeds.specialLoc != "")) {
	    	cropList.push(JSON.parse(JSON.stringify(season.crops[i])));
	    	cropList[cropList.length - 1].id = i;
		}
	}
}

/*
 * Calculates all profits and losses for all crops in the cropList array.
 */
function valueCrops() {
	for (var i = 0; i < cropList.length; i++) {
        if (cropList[i].isWildseed && options.skills.gatherer) {
            cropList[i].produce.extra += 1;
            cropList[i].produce.extraPerc += 0.2;
        }
		cropList[i].planted = planted(cropList[i]);
		cropList[i].harvests = harvests(cropList[i].id);
		cropList[i].seedLoss = seedLoss(cropList[i]);
		cropList[i].fertLoss = fertLoss(cropList[i]);
		cropList[i].profitData = profit(cropList[i]);
        cropList[i].profit = cropList[i].profitData.profit;
		cropList[i].totalReturnOnInvestment = cropList[i].profitData.totalReturnOnInvestment;
		cropList[i].averageReturnOnInvestment = cropList[i].profitData.averageReturnOnInvestment;
		cropList[i].netExpenses = cropList[i].profitData.netExpenses;
		cropList[i].averageProfit = perDay(cropList[i].profit);
		cropList[i].averageSeedLoss = perDay(cropList[i].seedLoss);
		cropList[i].averageFertLoss = perDay(cropList[i].fertLoss);

        // In Expansion Mode, override the profit with expansion profit
        if (options.expansionMode) {
            cropList[i].profit = expansionTotalProfit(cropList[i]);
            cropList[i].seedLoss = 0;
            cropList[i].fertLoss = 0;
            cropList[i].averageProfit = perDay(cropList[i].profit);
            cropList[i].averageSeedLoss = 0;
            cropList[i].averageFertLoss = 0;
        }

		if (options.average == 1) {
			cropList[i].drawProfit = cropList[i].averageProfit;
			cropList[i].drawSeedLoss = cropList[i].averageSeedLoss;
			cropList[i].drawFertLoss = cropList[i].averageFertLoss;
			graphDescription = "Daily Profit"
		}
		else if ((options.average == 2) ){
			if (options.buySeed || (options.buyFert && fertilizers[options.fertilizer].cost > 0)) {
				cropList[i].drawProfit = cropList[i].totalReturnOnInvestment;
				graphDescription = "Total Return On Investment";
			}
			else {
				cropList[i].drawProfit = 0;
				graphDescription = "Total Profit (Choose an expense for ROI)";
			}
			cropList[i].drawSeedLoss = cropList[i].seedLoss;
			cropList[i].drawFertLoss = cropList[i].fertLoss;
		}
		else if (options.average == 3) {
			cropList[i].drawSeedLoss = cropList[i].averageSeedLoss;
			cropList[i].drawFertLoss = cropList[i].averageFertLoss;
			if (options.buySeed || (options.buyFert && fertilizers[options.fertilizer].cost > 0)) {
				cropList[i].drawProfit = cropList[i].averageReturnOnInvestment;
				graphDescription = "Daily Return On Investment";
			}
			else {
				cropList[i].drawProfit = 0;
				graphDescription = "Daily Profit (Choose an expense for ROI)";
			}
		}
		else {
			cropList[i].drawProfit = cropList[i].profit;
			cropList[i].drawSeedLoss = cropList[i].seedLoss;
			cropList[i].drawFertLoss = cropList[i].fertLoss;
			graphDescription = "Total Profit";
		}
	}
}

/*
 * Sorts the cropList array, so that the most profitable crop is the first one.
 */
function sortCrops() {
	var swapped;
    do {
        swapped = false;
        for (var i = 0; i < cropList.length - 1; i++) {
            if (cropList[i].drawProfit < cropList[i + 1].drawProfit) {
                var temp = cropList[i];
                cropList[i] = cropList[i + 1];
                cropList[i + 1] = temp;
                swapped = true;
            }
        }
    } while (swapped);


	// console.log("==== SORTED ====");
	for (var i = 0; i < cropList.length; i++) {
		// console.log(cropList[i].drawProfit.toFixed(2) + "  " + cropList[i].name);
	}
}

/*
 * Updates the X D3 scale.
 * @return The new scale.
 */
function updateScaleX() {
	return d3.scale.ordinal()
		.domain(d3.range(seasons[4].crops.length))
		.rangeRoundBands([0, width]);
}

/*
 * Updates the Y D3 scale.
 * @return The new scale.
 */
function updateScaleY() {
	return d3.scale.linear()
		.domain([0, d3.max(cropList, function(d) {
			if (d.drawProfit >= 0) {
				return (~~((d.drawProfit + 99) / 100) * 100);
			}
			else {
				var profit = d.drawProfit;
				if (options.buySeed) {
					if (d.seedLoss < profit)
						profit = d.drawSeedLoss;
				}
				if (options.buyFert) {
					if (d.fertLoss < profit)
						profit = d.drawFertLoss;
				}
				return (~~((-profit + 99) / 100) * 100);
			}
		})])
		.range([height, 0]);
}

/*
 * Updates the axis D3 scale.
 * @return The new scale.
 */
function updateScaleAxis() {
	return d3.scale.linear()
		.domain([
			-d3.max(cropList, function(d) {
				if (d.drawProfit >= 0) {
					return (~~((d.drawProfit + 99) / 100) * 100);
				}
				else {
					var profit = d.drawProfit;
					if (options.buySeed) {
						if (d.seedLoss < profit)
							profit = d.drawSeedLoss;
					}
					if (options.buyFert) {
						if (d.fertLoss < profit)
							profit = d.drawFertLoss;
					}
					return (~~((-profit + 99) / 100) * 100);
				}
			}),
			d3.max(cropList, function(d) {
				if (d.drawProfit >= 0) {
					return (~~((d.drawProfit + 99) / 100) * 100);
				}
				else {
					var profit = d.drawProfit;
					if (options.buySeed) {
						if (d.seedLoss < profit)
							profit = d.drawSeedLoss;
					}
					if (options.buyFert) {
						if (d.fertLoss < profit)
							profit = d.drawFertLoss;
					}
					return (~~((-profit + 99) / 100) * 100);
				}
			})])
		.range([height*2, 0]);
}

/*
 * Renders the graph.
 * This is called only when opening for the first time or when changing seasons/seeds.
 */
function renderGraph() {

	var x = updateScaleX();
	var y = updateScaleY();
	var ax = updateScaleAxis();

    var width = barOffsetX + barPadding * 2 + (barWidth + barPadding) * cropList.length + paddingLeft;
    if (width < svgMinWidth)
        width = svgMinWidth;
	svg.attr("width", width).style("padding-top", "12px");
	d3.select(".graph").attr("width", width);

	var yAxis = d3.svg.axis()
		.scale(ax)
		.orient("left")
		.tickFormat(d3.format(",s"))
		.ticks(16);

	axisY = gAxis.attr("class", "axis")
		.call(yAxis)
		.attr("transform", "translate(48, " + barOffsetY + ")");

	title = gTitle.attr("class", "Title")
		.append("text")
		.attr("class", "axis")
		.attr("x", 24)
		.attr("y", 12)
	 	.style("text-anchor", "start")
		.text(graphDescription);

	barsProfit = gProfit.selectAll("rect")
		.data(cropList)
		.enter()
		.append("rect")
			.attr("x", function(d, i) {
				if (d.drawProfit < 0 && options.buySeed && options.buyFert)
					return x(i) + barOffsetX + (barWidth / miniBar) * 2;
				else if (d.drawProfit < 0 && !options.buySeed && options.buyFert)
					return x(i) + barOffsetX + barWidth / miniBar;
				else if (d.drawProfit < 0 && options.buySeed && !options.buyFert)
					return x(i) + barOffsetX + barWidth / miniBar;
				else
					return x(i) + barOffsetX;
			})
			.attr("y", function(d) {
				if (d.drawProfit >= 0)
					return y(d.drawProfit) + barOffsetY;
				else
					return height + barOffsetY;
			})
			.attr("height", function(d) {
				if (d.drawProfit >= 0)
					return height - y(d.drawProfit);
				else
					return height - y(-d.drawProfit);
			})
			.attr("width", function(d) {
				if (d.drawProfit < 0 && options.buySeed && options.buyFert)
					return barWidth - (barWidth / miniBar) * 2;
				else if (d.drawProfit < 0 && !options.buySeed && options.buyFert)
					return barWidth - barWidth / miniBar;
				else if (d.drawProfit < 0 && options.buySeed && !options.buyFert)
					return barWidth - barWidth / miniBar;
				else
					return barWidth;
			})
 			.attr("fill", function (d) {
 				if (d.drawProfit >= 0)
 					return "lime";
 				else
 					return "red";
 			});

	barsSeed = gSeedLoss.selectAll("rect")
		.data(cropList)
		.enter()
		.append("rect")
			.attr("x", function(d, i) { return x(i) + barOffsetX; })
			.attr("y", height + barOffsetY)
			.attr("height", function(d) {
				if (options.buySeed)
					return height - y(-d.drawSeedLoss);
				else
					return 0;
			})
			.attr("width", barWidth / miniBar)
 			.attr("fill", "orange");

	barsFert = gFertLoss.selectAll("rect")
		.data(cropList)
		.enter()
		.append("rect")
			.attr("x", function(d, i) {
				if (options.buySeed)
					return x(i) + barOffsetX + barWidth / miniBar;
				else
					return x(i) + barOffsetX;
			})
			.attr("y", height + barOffsetY)
			.attr("height", function(d) {
				if (options.buyFert)
					return height - y(-d.drawFertLoss);
				else
					return 0;
			})
			.attr("width", barWidth / miniBar)
 			.attr("fill", "brown");

 	imgIcons = gIcons.selectAll("image")
		.data(cropList)
		.enter()
		.append("svg:image")
			.attr("x", function(d, i) { return x(i) + barOffsetX; })
			.attr("y", function(d) {
				if (d.drawProfit >= 0)
					return y(d.drawProfit) + barOffsetY - barWidth - barPadding;
				else
					return height + barOffsetY - barWidth - barPadding;
			})
		    .attr('width', barWidth)
		    .attr('height', barWidth)
		    .attr("xlink:href", function(d) { return "img/" + d.img; });

	barsTooltips = gTooltips.selectAll("rect")
		.data(cropList)
		.enter()
		.append("rect")
			.attr("x", function(d, i) { return x(i) + barOffsetX - barPadding/2; })
			.attr("y", function(d) {
				if (d.drawProfit >= 0)
					return y(d.drawProfit) + barOffsetY - barWidth - barPadding;
				else
					return height + barOffsetY - barWidth - barPadding;
			})
			.attr("height", function(d) {
				var topHeight = 0;

				if (d.drawProfit >= 0)
					topHeight = height + barWidth + barPadding - y(d.drawProfit);
				else
					topHeight = barWidth + barPadding;

				var lossArray = [0];

				if (options.buySeed)
					lossArray.push(d.drawSeedLoss);
				if (options.buyFert)
					lossArray.push(d.drawFertLoss);
				if (d.drawProfit < 0)
					lossArray.push(d.drawProfit);

				var swapped;
			    do {
			        swapped = false;
			        for (var i = 0; i < lossArray.length - 1; i++) {
			            if (lossArray[i] > lossArray[i + 1]) {
			                var temp = lossArray[i];
			                lossArray[i] = lossArray[i + 1];
			                lossArray[i + 1] = temp;
			                swapped = true;
			            }
			        }
			    } while (swapped);

			    return topHeight + (height - y(-lossArray[0]));
			})
			.attr("width", barWidth + barPadding)
 			.attr("opacity", "0")
 			.attr("cursor", "pointer")
			.on("mouseover", function(d) {
				tooltip.selectAll("*").remove();
				tooltip.style("visibility", "visible");

				tooltip.append("h3").attr("class", "tooltipTitle").text(d.name);

				var tooltipTable = tooltip.append("table")
					.attr("class", "tooltipTable")
					.attr("cellspacing", 0);
				var tooltipTr;


				tooltipTr = tooltipTable.append("tr");
				tooltipTr.append("td").attr("class", "tooltipTdLeft").text("Total profit:");

				//PREDICTIVE PROFIT UI
				// if (d.profitData.predTotalProfit > 0)
				// 	tooltipTr.append("td").attr("class", "tooltipTdRightPos").text("+" + formatNumber(d.profitData.predTotalProfit))
				// 		.append("div").attr("class", "gold");
				// else
				// 	tooltipTr.append("td").attr("class", "tooltipTdRightNeg").text(formatNumber(d.profitData.predTotalProfit))
				// 		.append("div").attr("class", "gold");

				if (d.profit > 0)
					tooltipTr.append("td").attr("class", "tooltipTdRightPos").text("+" + formatNumber(d.profit))
						.append("div").attr("class", "gold");
				else
					tooltipTr.append("td").attr("class", "tooltipTdRightNeg").text(formatNumber(d.profit))
						.append("div").attr("class", "gold");

				tooltipTr = tooltipTable.append("tr");
				tooltipTr.append("td").attr("class", "tooltipTdLeft").text("Profit per day:");
				if (d.averageProfit > 0)
					tooltipTr.append("td").attr("class", "tooltipTdRightPos").text("+" + formatNumber(d.averageProfit))
						.append("div").attr("class", "gold");
				else
					tooltipTr.append("td").attr("class", "tooltipTdRightNeg").text(formatNumber(d.averageProfit))
						.append("div").attr("class", "gold");

				if (options.buySeed || options.buyFert) {
				tooltipTr = tooltipTable.append("tr");
				tooltipTr.append("td").attr("class", "tooltipTdLeft").text("Return on investment:");
				if (d.totalReturnOnInvestment > 0)
					tooltipTr.append("td").attr("class", "tooltipTdRightPos").text("+" + formatNumber(d.totalReturnOnInvestment) + "%");
				else
					tooltipTr.append("td").attr("class", "tooltipTdRightNeg").text(formatNumber(d.totalReturnOnInvestment) + "%");

				tooltipTr = tooltipTable.append("tr");
				tooltipTr.append("td").attr("class", "tooltipTdLeft").text("Return on investment per day:");
				if (d.averageReturnOnInvestment > 0)
					tooltipTr.append("td").attr("class", "tooltipTdRightPos").text("+" + formatNumber(d.averageReturnOnInvestment) + "%");
				else
					tooltipTr.append("td").attr("class", "tooltipTdRightNeg").text(formatNumber(d.averageReturnOnInvestment) + "%");
				}

				if (options.buySeed) {
					tooltipTr = tooltipTable.append("tr");
					tooltipTr.append("td").attr("class", "tooltipTdLeftSpace").text("Total seed loss:");
					tooltipTr.append("td").attr("class", "tooltipTdRightNeg").text(formatNumber(d.seedLoss))
						.append("div").attr("class", "gold");

					tooltipTr = tooltipTable.append("tr");
					tooltipTr.append("td").attr("class", "tooltipTdLeft").text("Seed loss per day:");
					tooltipTr.append("td").attr("class", "tooltipTdRightNeg").text(formatNumber(d.averageSeedLoss))
						.append("div").attr("class", "gold");
				}

				if (options.buyFert) {
					tooltipTr = tooltipTable.append("tr");
					tooltipTr.append("td").attr("class", "tooltipTdLeftSpace").text("Total fertilizer loss:");
					tooltipTr.append("td").attr("class", "tooltipTdRightNeg").text(formatNumber(d.fertLoss))
						.append("div").attr("class", "gold");

					tooltipTr = tooltipTable.append("tr");
					tooltipTr.append("td").attr("class", "tooltipTdLeft").text("Fertilizer loss per day:");
					tooltipTr.append("td").attr("class", "tooltipTdRightNeg").text(formatNumber(d.averageFertLoss))
						.append("div").attr("class", "gold");
				}


				//Ineligible crops are sold raw.
				tooltipTr = tooltipTable.append("tr");
				tooltipTr.append("td").attr("class", "tooltipTdLeftSpace").text("Produce sold:");
				switch (options.produce) {
					case 0: 
						tooltipTr.append("td").attr("class", "tooltipTdRight").text("Raw crops"); 
						
						tooltipTr = tooltipTable.append("tr");
						tooltipTr.append("td").attr("class", "tooltipTdRight").text("Quantity sold:");

						if(d.profitData.quantitySold > 0 ){
							tooltipTr.append("td").attr("class", "tooltipTdRight").text(d.profitData.quantitySold);
						}
						else
							tooltipTr.append("td").attr("class", "tooltipTdRightNeg").text(d.profitData.quantitySold);
						break;
					case 1:
						if (d.produce.jarType != null){
							tooltipTr.append("td").attr("class", "tooltipTdRight").text(d.produce.jarType);
							tooltipTr = tooltipTable.append("tr");
							tooltipTr.append("td").attr("class", "tooltipTdRight").text("Quantity sold:");

							if(d.profitData.quantitySold > 0 ){
								tooltipTr.append("td").attr("class", "tooltipTdRight").text(d.profitData.quantitySold);
								tooltipTr = tooltipTable.append("tr");
								if(options.sellExcess && d.profitData.excessProduce > 0){
									tooltipTr.append("td").attr("class", "tooltipTdRight").text("Excess Produce:");
									tooltipTr.append("td").attr("class", "tooltipTdRight").text(d.profitData.excessProduce);
								} else if (d.profitData.excessProduce > 0){
									tooltipTr.append("td").attr("class", "tooltipTdRight").text("Excess Produce Unsold:");
									tooltipTr.append("td").attr("class", "tooltipTdRightNeg").text(d.profitData.excessProduce);
								}
							}
							else
								tooltipTr.append("td").attr("class", "tooltipTdRightNeg").text(d.profitData.quantitySold);
						}
						else if (options.sellRaw) {
							tooltipTr.append("td").attr("class", "tooltipTdRightNeg").text("Raw crops");
							tooltipTr = tooltipTable.append("tr");
							tooltipTr.append("td").attr("class", "tooltipTdRight").text("Quantity sold:");
							tooltipTr.append("td").attr("class", "tooltipTdRight").text(d.profitData.quantitySold);
						}
						else
							tooltipTr.append("td").attr("class", "tooltipTdRightNeg").text("None");
						break;
					case 2:
						if (d.produce.kegType != null){
							tooltipTr.append("td").attr("class", "tooltipTdRight").text(d.produce.kegType);
							tooltipTr = tooltipTable.append("tr");
							tooltipTr.append("td").attr("class", "tooltipTdRight").text("Quantity sold:");

							if(d.profitData.quantitySold > 0 ){
								tooltipTr.append("td").attr("class", "tooltipTdRight").text(d.profitData.quantitySold);
								tooltipTr = tooltipTable.append("tr");
								if(options.sellExcess && d.profitData.excessProduce > 0){
									tooltipTr.append("td").attr("class", "tooltipTdRight").text("Excess Produce:");
									tooltipTr.append("td").attr("class", "tooltipTdRight").text(d.profitData.excessProduce);
								} else if (d.profitData.excessProduce > 0){
									tooltipTr.append("td").attr("class", "tooltipTdRight").text("Excess Produce Unsold:");
									tooltipTr.append("td").attr("class", "tooltipTdRightNeg").text(d.profitData.excessProduce);
								}
							}
							else
								tooltipTr.append("td").attr("class", "tooltipTdRightNeg").text(d.profitData.quantitySold);
						}
						else if (options.sellRaw) {
							tooltipTr.append("td").attr("class", "tooltipTdRightNeg").text("Raw crops");
							tooltipTr = tooltipTable.append("tr");
							tooltipTr.append("td").attr("class", "tooltipTdRight").text("Quantity sold:");
							tooltipTr.append("td").attr("class", "tooltipTdRight").text(d.profitData.quantitySold);
						}
						else
							tooltipTr.append("td").attr("class", "tooltipTdRightNeg").text("None");
						break;
					case 3: 
						tooltipTr.append("td").attr("class", "tooltipTdRight").text("Seeds"); 
						tooltipTr = tooltipTable.append("tr");
						tooltipTr.append("td").attr("class", "tooltipTdRight").text("Quantity sold:");

						if(d.profitData.quantitySold > 0 ){
							tooltipTr.append("td").attr("class", "tooltipTdRight").text(d.profitData.quantitySold);
						}
						else
							tooltipTr.append("td").attr("class", "tooltipTdRightNeg").text(d.profitData.quantitySold);
						break;
					case 4:
						if (d.produce.dehydratorType != null){
							tooltipTr.append("td").attr("class", "tooltipTdRight").text(d.produce.dehydratorType);
							tooltipTr = tooltipTable.append("tr");
							tooltipTr.append("td").attr("class", "tooltipTdRight").text("Quantity sold:");

							if(d.profitData.quantitySold > 0 ){
								tooltipTr.append("td").attr("class", "tooltipTdRight").text(d.profitData.quantitySold);
								tooltipTr = tooltipTable.append("tr");
								if(options.sellExcess && d.profitData.excessProduce > 0){
									tooltipTr.append("td").attr("class", "tooltipTdRight").text("Excess Produce:");
									tooltipTr.append("td").attr("class", "tooltipTdRight").text(d.profitData.excessProduce);
								} else if (d.profitData.excessProduce > 0){
									tooltipTr.append("td").attr("class", "tooltipTdRight").text("Excess Produce Unsold:");
									tooltipTr.append("td").attr("class", "tooltipTdRightNeg").text(d.profitData.excessProduce);
								}
							}
							else
								tooltipTr.append("td").attr("class", "tooltipTdRightNeg").text(d.profitData.quantitySold);
						}
						else if (options.sellRaw){
							tooltipTr.append("td").attr("class", "tooltipTdRightNeg").text("Raw crops");
							tooltipTr = tooltipTable.append("tr");
							tooltipTr.append("td").attr("class", "tooltipTdRight").text("Quantity sold:");
							tooltipTr.append("td").attr("class", "tooltipTdRight").text(d.profitData.quantitySold);
						}
						else
							tooltipTr.append("td").attr("class", "tooltipTdRightNeg").text("None");
						break;
					case 5: 
						tooltipTr.append("td").attr("class", "tooltipTdRight").text(d.produce.millType); 
						tooltipTr = tooltipTable.append("tr");
						tooltipTr.append("td").attr("class", "tooltipTdRight").text("Quantity sold:");

						if(d.profitData.quantitySold > 0 ){
							tooltipTr.append("td").attr("class", "tooltipTdRight").text(d.profitData.quantitySold);
						}
						else
							tooltipTr.append("td").attr("class", "tooltipTdRightNeg").text(d.profitData.quantitySold);
						break;
				}
				tooltipTr = tooltipTable.append("tr");
				tooltipTr.append("td").attr("class", "tooltipTdLeft").text("Duration:");
				tooltipTr.append("td").attr("class", "tooltipTdRight").text(options.days + " days");
				tooltipTr = tooltipTable.append("tr");
				tooltipTr.append("td").attr("class", "tooltipTdLeft").text("Crop tiles:");
				tooltipTr.append("td").attr("class", "tooltipTdRight").text(d.planted);
				tooltipTr = tooltipTable.append("tr");
				tooltipTr.append("td").attr("class", "tooltipTdLeft").text("Harvests:");
				tooltipTr.append("td").attr("class", "tooltipTdRight").text(d.harvests);

				if (options.extra) {
					var fertilizer = fertilizers[options.fertilizer];
					var kegModifier = getKegModifier(d);
					var caskModifier = getCaskModifier();
					var kegPrice = d.produce.kegType != null && options.aging != "None" ? d.produce.price * kegModifier * caskModifier : d.produce.price * kegModifier;                    
                    if (d.produce.kegType == "Pale Ale") {
                        kegPrice = d.produce.keg;
                    }
					var dehydratorModifierByCrop = d.produce.dehydratorType != null ? getDehydratorModifier(d): 0;
                    var millModifierByCrop = d.produce.millType != null ? getMillModifier(d): 0;
					var seedPrice = d.seeds.sell;
					var initialGrow = 0;
					if (options.skills.agri)
						initialGrow += Math.floor(d.growth.initial * (fertilizer.growth - 0.1));
					else
						initialGrow += Math.floor(d.growth.initial * fertilizer.growth);

					tooltip.append("h3").attr("class", "tooltipTitleExtra").text("Crop Info");
					if(options.predictionModel)
						tooltip.append("h4").attr("class", "tooltipTitleExtra").text("Predicted Outcome:");
					tooltipTable = tooltip.append("table")
						.attr("class", "tooltipTable")
						.attr("cellspacing", 0);

					
					if(options.predictionModel || options.sellExcess && options.predictionModel){
						// headers
						tooltipTr = tooltipTable.append("thead").append("tr");
						tooltipTr.append("th").attr("class", "tooltipThCenter").text("Quality");
						tooltipTr.append("th").attr("class", "tooltipThCenter").text("Sell Price (Chance)");
						// tooltipTr.append("th").attr("class", "tooltipThCenter").text("Probability");
						tooltipTr.append("th").attr("class", "tooltipThCenter").text("Raw Sold");

						//body
						tooltipBody = tooltipTable.append("tbody");

						//Row 1
						tooltipBodyTR = tooltipBody.append("tr");
						tooltipBodyTR.append("td").attr("class", "tooltipTdLeft").text("Normal");
						tooltipBodyTR.append("td").attr("class", "tooltipTdRight").text(d.produce.price + " (" + (d.profitData.regular*100).toFixed(0) + "%)").append("div").attr("class", "gold");
						tooltipBodyTR.append("td").attr("class", "tooltipTdRight").text(d.produce.regular);

						//Row 2
						tooltipBodyTR = tooltipBody.append("tr");
						tooltipBodyTR.append("td").attr("class", "tooltipTdLeft").text("Silver");
						tooltipBodyTR.append("td").attr("class", "tooltipTdRight").text(Math.trunc(d.produce.price * 1.25) + " (" + (d.profitData.silver*100).toFixed(0) + "%)").append("div").attr("class", "gold");
						tooltipBodyTR.append("td").attr("class", "tooltipTdRight").text(d.produce.silver);

						//Row 3
						tooltipBodyTR = tooltipBody.append("tr");
						tooltipBodyTR.append("td").attr("class", "tooltipTdLeft").text("Gold");
						tooltipBodyTR.append("td").attr("class", "tooltipTdRight").text(Math.trunc(d.produce.price * 1.5) + " (" + (d.profitData.gold*100).toFixed(0) + "%)").append("div").attr("class", "gold");
						tooltipBodyTR.append("td").attr("class", "tooltipTdRight").text(d.produce.gold);

						//Row 4
						tooltipBodyTR = tooltipBody.append("tr");
						tooltipBodyTR.append("td").attr("class", "tooltipTdLeft").text("Iridium");
						tooltipBodyTR.append("td").attr("class", "tooltipTdRight").text(Math.trunc(d.produce.price * 2) + " (" + (d.profitData.iridium*100).toFixed(0) + "%)").append("div").attr("class", "gold");
						tooltipBodyTR.append("td").attr("class", "tooltipTdRight").text(d.produce.iridium);
					} else {
						
						if (!(d.isWildseed && options.skills.botanist)) {
							tooltipTr = tooltipTable.append("tr");
							tooltipTr.append("td").attr("class", "tooltipTdLeft").text("Value (Normal):");
							tooltipTr.append("td").attr("class", "tooltipTdRight").text(d.produce.price)
								.append("div").attr("class", "gold");
							tooltipTr.append("td").attr("class", "tooltipTdRight").text("(" + (d.profitData.regular*100).toFixed(0) + "%)");
						}
						if (d.name != "Tea Leaves") {
							if (!(d.isWildseed && options.skills.botanist)) {
								tooltipTr = tooltipTable.append("tr");
								tooltipTr.append("td").attr("class", "tooltipTdLeft").text("Value (Silver):");
								tooltipTr.append("td").attr("class", "tooltipTdRight").text(Math.trunc(d.produce.price * 1.25))
									.append("div").attr("class", "gold");
								tooltipTr.append("td").attr("class", "tooltipTdRight").text("(" + (d.profitData.silver*100).toFixed(0) + "%)");
								tooltipTr = tooltipTable.append("tr");
								tooltipTr.append("td").attr("class", "tooltipTdLeft").text("Value (Gold):");
								tooltipTr.append("td").attr("class", "tooltipTdRight").text(Math.trunc(d.produce.price * 1.5))
									.append("div").attr("class", "gold");
								tooltipTr.append("td").attr("class", "tooltipTdRight").text("(" + (d.profitData.gold*100).toFixed(0) + "%)");
							}
							if ((!d.isWildseed && fertilizers[options.fertilizer].ratio >= 3) || (d.isWildseed && options.skills.botanist)) {
								tooltipTr = tooltipTable.append("tr");
								tooltipTr.append("td").attr("class", "tooltipTdLeft").text("Value (Iridium):");
								tooltipTr.append("td").attr("class", "tooltipTdRight").text(d.produce.price * 2)
									.append("div").attr("class", "gold");
								tooltipTr.append("td").attr("class", "tooltipTdRight").text("(" + (d.profitData.iridium*100).toFixed(0) + "%)");
							}
						}
					}

					tooltip.append("h4").attr("class", "tooltipTitleExtra").text("Artisan:");
					tooltipTable = tooltip.append("table")
						.attr("class", "tooltipTable")
						.attr("cellspacing", 0);
					tooltipTr = tooltipTable.append("tr");
					if (d.produce.jarType) {
						tooltipTr.append("td").attr("class", "tooltipTdLeftSpace").text("Value (" + d.produce.jarType + "):");
						tooltipTr.append("td").attr("class", "tooltipTdRight").text(options.skills.arti ? Math.round((d.produce.price * 2 + 50) * 1.4) : d.produce.price * 2 + 50)
						.append("div").attr("class", "gold");
					}
					else {
						tooltipTr.append("td").attr("class", "tooltipTdLeftSpace").text("Value (Jar):");
						tooltipTr.append("td").attr("class", "tooltipTdRight").text("None");
					}
					tooltipTr = tooltipTable.append("tr");
					if (d.produce.kegType) {
						tooltipTr.append("td").attr("class", "tooltipTdLeft").text("Value (" + d.produce.kegType + "):");
						tooltipTr.append("td").attr("class", "tooltipTdRight").text(Math.round(kegPrice))
						.append("div").attr("class", "gold");
					}
					else {
						tooltipTr.append("td").attr("class", "tooltipTdLeft").text("Value (Keg):");
						tooltipTr.append("td").attr("class", "tooltipTdRight").text("None");
					}
					tooltipTr = tooltipTable.append("tr");
					if (d.produce.dehydratorType) {
						tooltipTr.append("td").attr("class", "tooltipTdLeft").text("Value (" + d.produce.dehydratorType + "):");
						tooltipTr.append("td").attr("class", "tooltipTdRight").text(dehydratorModifierByCrop)
						.append("div").attr("class", "gold");
					} else {
						tooltipTr.append("td").attr("class", "tooltipTdLeft").text("Value (Dehydrator):");
						tooltipTr.append("td").attr("class", "tooltipTdRight").text("None");
					}
					tooltipTr = tooltipTable.append("tr");
					if (d.produce.millType) {
						tooltipTr.append("td").attr("class", "tooltipTdLeft").text("Value (" + d.produce.millType + "):");
						tooltipTr.append("td").attr("class", "tooltipTdRight").text(millModifierByCrop)
						.append("div").attr("class", "gold");
					} else {
						tooltipTr.append("td").attr("class", "tooltipTdLeft").text("Value (Mill):");
						tooltipTr.append("td").attr("class", "tooltipTdRight").text("None");
					}
          tooltipTr = tooltipTable.append("tr");
          tooltipTr.append("td").attr("class", "tooltipTdLeft").text("Value (Seeds):");
          tooltipTr.append("td").attr("class", "tooltipTdRight").text(seedPrice)
          .append("div").attr("class", "gold");
					
					tooltip.append("h4").attr("class", "tooltipTitleExtra").text("Other Details:");
					tooltipTable = tooltip.append("table")
						.attr("class", "tooltipTable")
						.attr("cellspacing", 0);

					var first = true;
					if (d.seeds.pierre > 0) {
						tooltipTr = tooltipTable.append("tr");
						tooltipTr.append("td").attr("class", "tooltipTdLeftSpace").text("Seeds (Pierre):");
						first = false;
						tooltipTr.append("td").attr("class", "tooltipTdRight").text(d.seeds.pierre)
						.append("div").attr("class", "gold");
					}
					if (d.seeds.joja > 0) {
						tooltipTr = tooltipTable.append("tr");
						if (first) {
							tooltipTr.append("td").attr("class", "tooltipTdLeftSpace").text("Seeds (Joja):");
							first = false;
						}
						else
							tooltipTr.append("td").attr("class", "tooltipTdLeft").text("Seeds (Joja):");
						tooltipTr.append("td").attr("class", "tooltipTdRight").text(d.seeds.joja)
						.append("div").attr("class", "gold");
					}
					if (d.seeds.special > 0) {
						tooltipTr = tooltipTable.append("tr");
						if (first) {
							tooltipTr.append("td").attr("class", "tooltipTdLeftSpace").text("Seeds (Special):");
							first = false;
						}
						else
							tooltipTr.append("td").attr("class", "tooltipTdLeft").text("Seeds (Special):");
						tooltipTr.append("td").attr("class", "tooltipTdRight").text(d.seeds.special)
						.append("div").attr("class", "gold");
						tooltipTr = tooltipTable.append("tr");
						tooltipTr.append("td").attr("class", "tooltipTdLeft").text("");
						tooltipTr.append("td").attr("class", "tooltipTdRight").text(d.seeds.specialLoc);
					}

					tooltipTr = tooltipTable.append("tr");
					tooltipTr.append("td").attr("class", "tooltipTdLeftSpace").text("Time to grow:");
					tooltipTr.append("td").attr("class", "tooltipTdRight").text(initialGrow + " days");
					tooltipTr = tooltipTable.append("tr");
					tooltipTr.append("td").attr("class", "tooltipTdLeft").text("Time to regrow:");
					if (d.growth.regrow > 0)
						tooltipTr.append("td").attr("class", "tooltipTdRight").text(d.growth.regrow + " days");
					else
						tooltipTr.append("td").attr("class", "tooltipTdRight").text("N/A");
					if (d.produce.extra > 0) {
						tooltipTr = tooltipTable.append("tr");
						tooltipTr.append("td").attr("class", "tooltipTdLeft").text("Extra produce:");
						tooltipTr.append("td").attr("class", "tooltipTdRight").text(d.produce.extra);
						tooltipTr = tooltipTable.append("tr");
						tooltipTr.append("td").attr("class", "tooltipTdLeft").text("Extra chance:");
						tooltipTr.append("td").attr("class", "tooltipTdRight").text((d.produce.extraPerc * 100) + "%");
					}
					if( d.produce.extraPerc > 0 ){
						tooltipTr = tooltipTable.append("tr");
						tooltipTr.append("td").attr("class", "tooltipTdLeft").text("Extra Produced:");

						if(d.produce.extraProduced > 0)
							tooltipTr.append("td").attr("class", "tooltipTdRight").text(d.produce.extraProduced);
						
						else 
							tooltipTr.append("td").attr("class", "tooltipTdRightNeg").text(d.produce.extraProduced);

					}
				}
			})
			
			.on("mousemove", function() {
				tooltip.style("top", (d3.event.pageY - 16) + "px").style("left",(d3.event.pageX + 20) + "px");
			})
			.on("mouseout", function() { tooltip.style("visibility", "hidden"); })
			.on("click", function(d) { 
				if(!options.disableLinks)
					window.open(d.url, "_blank"); 
			});

}

/*
 * Updates the already rendered graph, showing animations.
 */
function updateGraph() {
	var x = updateScaleX();
	var y = updateScaleY();
	var ax = updateScaleAxis();

	var yAxis = d3.svg.axis()
		.scale(ax)
		.orient("left")
		.tickFormat(d3.format(",s"))
		.ticks(16);

	axisY.transition()
		.call(yAxis);

	title = gTitle.attr("class", "Title")
	.append("text")
	.attr("class", "axis")
	.attr("x", 24)
    .attr("y", 12)
	.style("text-anchor", "start")
	.text(graphDescription);

	barsProfit.data(cropList)
		.transition()
			.attr("x", function(d, i) {
				if (d.drawProfit < 0 && options.buySeed && options.buyFert)
					return x(i) + barOffsetX + (barWidth / miniBar) * 2;
				else if (d.drawProfit < 0 && !options.buySeed && options.buyFert)
					return x(i) + barOffsetX + barWidth / miniBar;
				else if (d.drawProfit < 0 && options.buySeed && !options.buyFert)
					return x(i) + barOffsetX + barWidth / miniBar;
				else
					return x(i) + barOffsetX;
			})
			.attr("y", function(d) {
				if (d.drawProfit >= 0)
					return y(d.drawProfit) + barOffsetY;
				else
					return height + barOffsetY;
			})
			.attr("height", function(d) {
				if (d.drawProfit >= 0)
					return height - y(d.drawProfit);
				else
					return height - y(-d.drawProfit);
			})
			.attr("width", function(d) {
				if (d.drawProfit < 0 && options.buySeed && options.buyFert)
					return barWidth - (barWidth / miniBar) * 2;
				else if (d.drawProfit < 0 && !options.buySeed && options.buyFert)
					return barWidth - barWidth / miniBar;
				else if (d.drawProfit < 0 && options.buySeed && !options.buyFert)
					return barWidth - barWidth / miniBar;
				else
					return barWidth;
			})
 			.attr("fill", function (d) {
 				if (d.drawProfit >= 0)
 					return "lime";
 				else
 					return "red";
 			});

	barsSeed.data(cropList)
		.transition()
			.attr("x", function(d, i) { return x(i) + barOffsetX; })
			.attr("y", height + barOffsetY)
			.attr("height", function(d) {
				if (options.buySeed)
					return height - y(-d.drawSeedLoss);
				else
					return 0;
			})
			.attr("width", barWidth / miniBar)
 			.attr("fill", "orange");

	barsFert.data(cropList)
		.transition()
			.attr("x", function(d, i) {
				if (options.buySeed)
					return x(i) + barOffsetX + barWidth / miniBar;
				else
					return x(i) + barOffsetX;
			})
			.attr("y", height + barOffsetY)
			.attr("height", function(d) {
				if (options.buyFert)
					return height - y(-d.drawFertLoss);
				else
					return 0;
			})
			.attr("width", barWidth / miniBar)
 			.attr("fill", "brown");

 	imgIcons.data(cropList)
		.transition()
			.attr("x", function(d, i) { return x(i) + barOffsetX; })
			.attr("y", function(d) {
				if (d.drawProfit >= 0)
					return y(d.drawProfit) + barOffsetY - barWidth - barPadding;
				else
					return height + barOffsetY - barWidth - barPadding;
			})
		    .attr('width', barWidth)
		    .attr('height', barWidth)
		    .attr("xlink:href", function(d) { return "img/" + d.img; });

	barsTooltips.data(cropList)
		.transition()
			.attr("x", function(d, i) { return x(i) + barOffsetX - barPadding/2; })
			.attr("y", function(d) {
				if (d.drawProfit >= 0)
					return y(d.drawProfit) + barOffsetY - barWidth - barPadding;
				else
					return height + barOffsetY - barWidth - barPadding;
			})
			.attr("height", function(d) {
				var topHeight = 0;

				if (d.drawProfit >= 0)
					topHeight = height + barWidth + barPadding - y(d.drawProfit);
				else
					topHeight = barWidth + barPadding;

				var lossArray = [0];

				if (options.buySeed)
					lossArray.push(d.drawSeedLoss);
				if (options.buyFert)
					lossArray.push(d.drawFertLoss);
				if (d.drawProfit < 0)
					lossArray.push(d.drawProfit);

				var swapped;
			    do {
			        swapped = false;
			        for (var i = 0; i < lossArray.length - 1; i++) {
			            if (lossArray[i] > lossArray[i + 1]) {
			                var temp = lossArray[i];
			                lossArray[i] = lossArray[i + 1];
			                lossArray[i + 1] = temp;
			                swapped = true;
			            }
			        }
			    } while (swapped);

			    return topHeight + (height - y(-lossArray[0]));
			})
			.attr("width", barWidth + barPadding);
}

function updateSeasonNames() {
    if (options.crossSeason) {
        document.getElementById('season_0').innerHTML = "Spring & Summer";
        document.getElementById('season_1').innerHTML = "Summer & Fall";
        document.getElementById('season_2').innerHTML = "Fall & Winter";
        document.getElementById('season_3').innerHTML = "Winter & Spring";
    }
    else {
        document.getElementById('season_0').innerHTML = "Spring";
        document.getElementById('season_1').innerHTML = "Summer";
        document.getElementById('season_2').innerHTML = "Fall";
        document.getElementById('season_3').innerHTML = "Winter";
    }
}

/*
 * Updates all options and data, based on the options set in the HTML.
 * After that, filters, values and sorts all the crops again.
 */
function updateData() {

    options.season = parseInt(document.getElementById('select_season').value);
    const isGreenhouse = options.season == 4;

	options.produce = parseInt(document.getElementById('select_produce').value);

	var tr_equipmentID = document.getElementById('tr_equipment');
	var tr_check_sellRawID = document.getElementById('tr_check_sellRaw');
	var tr_check_sellExcessID = document.getElementById('tr_check_sellExcess');
	var tr_check_byHarvestID = document.getElementById('tr_check_byHarvest');
	var tr_select_agingID = document.getElementById('tr_select_aging');

    if (options.produce == 0 || options.produce == 3 || options.produce == 5) {
		tr_equipmentID.classList.add('hidden');
		tr_check_sellRawID.classList.add('hidden');
		tr_check_sellExcessID.classList.add('hidden');
		tr_check_byHarvestID.classList.add('hidden');
		tr_select_agingID.classList.add('hidden');
    }
	else if (options.produce == 1 || options.produce == 2) {
		tr_equipmentID.classList.remove('hidden');
		tr_check_sellRawID.classList.remove('hidden');
		tr_check_sellExcessID.classList.remove('hidden');
		tr_check_byHarvestID.classList.add('hidden');
		if(options.produce == 2){
			tr_select_agingID.classList.remove('hidden');
		} else {
			tr_select_agingID.classList.add('hidden');
		}
	}
    else {		
		tr_equipmentID.classList.remove('hidden');
		tr_check_sellRawID.classList.remove('hidden');
		tr_check_sellExcessID.classList.remove('hidden');
		tr_check_byHarvestID.classList.remove('hidden');
		tr_select_agingID.classList.add('hidden');
    }
    options.sellRaw 	= document.getElementById('check_sellRaw').checked;	
    options.sellExcess 	= document.getElementById('check_sellExcess').checked;
    options.byHarvest 	= document.getElementById('check_byHarvest').checked;

    if (options.produce == 0 || options.produce == 3 || options.produce == 5) {
        document.getElementById('equipment').disabled = true;
        document.getElementById('equipment').style.cursor = "default";
		
		document.getElementById('check_sellRaw').checked = false;
		options.sellRaw 	= document.getElementById('check_sellRaw').checked;	
		
		document.getElementById('check_sellExcess').checked = false;
		options.sellExcess 	= document.getElementById('check_sellExcess').checked;
		
		document.getElementById('check_byHarvest').checked = false;
		options.byHarvest 	= document.getElementById('check_byHarvest').checked;
    }
    else {
        document.getElementById('equipment').disabled = false;
        document.getElementById('equipment').style.cursor = "text";
    }
    if (document.getElementById('equipment').value < 0)
        document.getElementById('equipment').value = 0;
    options.equipment = parseInt(document.getElementById('equipment').value);

    if (options.produce == 2) {
        document.getElementById('select_aging').disabled = false;
        document.getElementById('select_aging').style.cursor = "pointer";
    }
    else {
        document.getElementById('select_aging').disabled = true;
        document.getElementById('select_aging').style.cursor = "default";
        document.getElementById('select_aging').value = 0;
    }
    options.aging = parseInt(document.getElementById('select_aging').value);

	if (document.getElementById('max_seed_money').value < 0)
		document.getElementById('max_seed_money').value = '0';
	options.maxSeedMoney = parseInt(document.getElementById('max_seed_money').value);
	if (isNaN(options.maxSeedMoney)) {
		options.maxSeedMoney = 0;
	}

	options.average = parseInt(document.getElementById('select_profit_display').value);
    
    options.crossSeason = document.getElementById('cross_season').checked;

    if (!isGreenhouse) {
        document.getElementById('number_days').disabled = true;
        document.getElementById('cross_season').disabled = false;
        document.getElementById('cross_season').style.cursor = "pointer";
        document.getElementById('current_day').disabled = false;
        document.getElementById('current_day').style.cursor = "text";

        if (document.getElementById('current_day').value <= 0)
            document.getElementById('current_day').value = 1;
        if (options.crossSeason) {
            document.getElementById('number_days').value = 56;
            if (document.getElementById('current_day').value > 56)
                document.getElementById('current_day').value = 56;
            options.days = 57 - document.getElementById('current_day').value;
        }
        else {
            document.getElementById('number_days').value = 28;
            if (document.getElementById('current_day').value > 28)
                  document.getElementById('current_day').value = 28;
            options.days = 29 - document.getElementById('current_day').value;
        }
    } else {
        document.getElementById('number_days').disabled = false;
        document.getElementById('cross_season').disabled = true;
        document.getElementById('cross_season').style.cursor = "default";
        document.getElementById('current_day').disabled = true;
        document.getElementById('current_day').style.cursor = "default";
        
        document.getElementById('current_day').value = 1;

        if (document.getElementById('number_days').value > 100000)
            document.getElementById('number_days').value = 100000;
        options.days = document.getElementById('number_days').value;
    }

	options.seeds.pierre = document.getElementById('check_seedsPierre').checked;
	options.seeds.joja = document.getElementById('check_seedsJoja').checked;
	options.seeds.special = document.getElementById('check_seedsSpecial').checked;

	options.buySeed = document.getElementById('check_buySeed').checked;

    options.replant = document.getElementById('check_replant').checked;

    if (!options.replant || isGreenhouse) {
        document.getElementById('check_nextyear').disabled = true;
        document.getElementById('check_nextyear').style.cursor = "default";
        document.getElementById('check_nextyear').checked = false;
    }
    else {
        document.getElementById('check_nextyear').disabled = false;
        document.getElementById('check_nextyear').style.cursor = "pointer";
    }
    options.nextyear = document.getElementById('check_nextyear').checked;

    if (document.getElementById('number_planted').value <= 0)
        document.getElementById('number_planted').value = 1;
    if (options.replant && parseInt(document.getElementById('number_planted').value) % 2 == 1)
        document.getElementById('number_planted').value = parseInt(document.getElementById('number_planted').value) + 1;

    options.planted = document.getElementById('number_planted').value;

	options.fertilizer = parseInt(document.getElementById('select_fertilizer').value);

	options.buyFert = document.getElementById('check_buyFert').checked;
	
	options.fertilizerSource = parseInt(document.getElementById('speed_gro_source').value);

	if (document.getElementById('farming_level').value <= 0)
		document.getElementById('farming_level').value = 0;
	if (document.getElementById('farming_level').value > 13)
		document.getElementById('farming_level').value = 13;
	options.level = parseInt(document.getElementById('farming_level').value);

	if (options.level >= 5) {
		document.getElementById('check_skillsTill').disabled = false;
		document.getElementById('check_skillsTill').style.cursor = "pointer";
		options.skills.till = document.getElementById('check_skillsTill').checked;
	}
	else {
		document.getElementById('check_skillsTill').disabled = true;
		document.getElementById('check_skillsTill').style.cursor = "default";
		document.getElementById('check_skillsTill').checked = false;
		options.skills.till = document.getElementById('check_skillsTill').checked;
	}

	if (options.level >= 10 && options.skills.till) {
		document.getElementById('select_skills').disabled = false;
		document.getElementById('select_skills').style.cursor = "pointer";
	}
	else {
		document.getElementById('select_skills').disabled = true;
		document.getElementById('select_skills').style.cursor = "default";
		document.getElementById('select_skills').value = 0;
	}
	if (document.getElementById('select_skills').value == 1) {
		options.skills.agri = true;
		options.skills.arti = false;
	}
	else if (document.getElementById('select_skills').value == 2) {
		options.skills.agri = false;
		options.skills.arti = true;
	}
	else {
		options.skills.agri = false;
		options.skills.arti = false;
	}

    if (document.getElementById('foraging_level').value <= 0)
        document.getElementById('foraging_level').value = 0;
    if (document.getElementById('foraging_level').value > 13)
        document.getElementById('foraging_level').value = 13;
    options.foragingLevel = parseInt(document.getElementById('foraging_level').value);

    if (options.foragingLevel >= 5) {
        document.getElementById('check_skillsGatherer').disabled = false;
        document.getElementById('check_skillsGatherer').style.cursor = "pointer";
    }
    else {
        document.getElementById('check_skillsGatherer').disabled = true;
        document.getElementById('check_skillsGatherer').style.cursor = "default";
        document.getElementById('check_skillsGatherer').checked = false;
    }
    options.skills.gatherer = document.getElementById('check_skillsGatherer').checked;

    if (options.foragingLevel >= 10 && options.skills.gatherer) {
        document.getElementById('check_skillsBotanist').disabled = false;
        document.getElementById('check_skillsBotanist').style.cursor = "pointer";
    }
    else {
        document.getElementById('check_skillsBotanist').disabled = true;
        document.getElementById('check_skillsBotanist').style.cursor = "default";
        document.getElementById('check_skillsBotanist').checked = false;
    }
    options.skills.botanist = document.getElementById('check_skillsBotanist').checked;

	options.foodIndex = document.getElementById('select_food').value;
	options.foodLevel = parseInt(document.getElementById('select_food').options[options.foodIndex].value);
	if (options.buyFert && options.fertilizer == 4)
		document.getElementById('speed_gro_source').disabled = false;
	else
		document.getElementById('speed_gro_source').disabled = true;

	options.extra = document.getElementById('check_extra').checked;
	options.disableLinks = document.getElementById('disable_links').checked;
	options.predictionModel = document.getElementById('predictionModel').checked;

    options.expansionMode = document.getElementById('expansion_mode').checked;

    var expansionRows = document.querySelectorAll('.expansion-mode-row');
    for (var i = 0; i < expansionRows.length; i++) {
        if (options.expansionMode) expansionRows[i].classList.remove('hidden');
        else expansionRows[i].classList.add('hidden');
    }

    if (document.getElementById('expansion_cap').value < 0)
        document.getElementById('expansion_cap').value = 0;
    options.expansionCap = parseInt(document.getElementById('expansion_cap').value) || 0;

    updateSeasonNames();

	// Persist the options object into the URL hash.
	window.location.hash = encodeURIComponent(serialize(options));

	fetchCrops();
	valueCrops();
	sortCrops();
}

// ======================== EXPANSION MODE PANEL ========================

/*
 * Formats a season day number as "Day X" or "Day X (Season)" for display.
 * @param relDay Relative day in the calculation period.
 * @return Formatted string.
 */
function formatExpansionDay(relDay) {
    var absDay = relToAbsDay(relDay);
    var seasonNames = ["Spring", "Summer", "Fall", "Winter"];
    if (options.season == 4) return "Day " + relDay;
    var dayOfSeason, seasonIdx;
    if (absDay <= 28) {
        dayOfSeason = absDay;
        seasonIdx = options.season;
    } else {
        dayOfSeason = absDay - 28;
        seasonIdx = (options.season + 1) % 4;
    }
    var label = seasonNames[seasonIdx] + " " + dayOfSeason;
    if (isFestivalDay(absDay)) label += " ★";
    return label;
}

/*
 * Populates the crop selector in the expansion panel with the current season's crops.
 */
function populateExpansionCropSelector() {
    var sel = document.getElementById('expansion_crop_select');
    if (!sel) return;
    sel.innerHTML = '';
    for (var i = 0; i < cropList.length; i++) {
        var opt = document.createElement('option');
        opt.value = i;
        opt.textContent = cropList[i].name;
        sel.appendChild(opt);
    }
}

/*
 * Renders the expansion cycle table for the crop at cropListIndex in cropList.
 * @param cropListIndex Index into the sorted cropList array.
 */
function renderExpansionTable(cropListIndex) {
    var tableDiv = document.getElementById('expansion_table_container');
    if (!tableDiv) return;
    if (cropListIndex < 0 || cropListIndex >= cropList.length) {
        tableDiv.innerHTML = '';
        return;
    }

    var crop = cropList[cropListIndex];
    var cycles = calcExpansionCycles(crop);

    if (!cycles.length) {
        tableDiv.innerHTML = '<p class="exp-no-data">No complete harvest cycles fit within the available days for this crop.</p>';
        return;
    }

    // Summary stats
    var totalRevenue = cycles.reduce(function(a, c) { return a + c.revenue; }, 0);
    var totalCost = cycles.reduce(function(a, c) { return a + c.cost; }, 0);
    var netProfit = totalRevenue - totalCost;
    var plantCycles = cycles.filter(function(c) { return c.type === 'plant'; }).length;
    var harvestCycles = cycles.filter(function(c) { return c.type === 'harvest'; }).length;

    var capTiles = parseInt(options.expansionCap) || 0;
    // For regrowing crops, peak = sum of all simultaneously active batches (stored during simulation).
    // For non-regrowing crops, only one batch is ever active at a time, so max single plant is correct.
    var maxTilesReached = cycles.peakTiles !== undefined
        ? cycles.peakTiles
        : cycles.filter(function(c) { return c.type === 'plant'; })
                .reduce(function(m, c) { return Math.max(m, c.crops); }, 0);

    var html = '<div class="exp-summary">';
    html += '<span class="exp-stat">Start: <b>' + parseInt(options.planted) + '</b> tiles</span>';
    if (capTiles > 0)
        html += '<span class="exp-stat">Cap: <b>' + capTiles + '</b> tiles</span>';
    html += '<span class="exp-stat">Peak: <b>' + maxTilesReached + '</b> tiles</span>';
    html += '<span class="exp-stat"><b>' + plantCycles + '</b> planting' + (plantCycles !== 1 ? 's' : '') + '</span>';
    html += '<span class="exp-stat"><b>' + harvestCycles + '</b> harvest' + (harvestCycles !== 1 ? 's' : '') + '</span>';
    html += '<span class="exp-stat">Total Revenue: <b class="exp-pos">+' + formatNumber(totalRevenue) + '</b><div class="gold"></div></span>';
    if (totalCost > 0)
        html += '<span class="exp-stat">Total Costs: <b class="exp-neg">-' + formatNumber(totalCost) + '</b><div class="gold"></div></span>';
    html += '<span class="exp-stat">Net Profit: <b class="' + (netProfit >= 0 ? 'exp-pos' : 'exp-neg') + '">' + (netProfit >= 0 ? '+' : '') + formatNumber(netProfit) + '</b><div class="gold"></div></span>';
    html += '</div>';

    // Warn when artisan processing time isn't modeled
    var processingDelays = { 1: "~3 days (Jar)", 2: "~7 days (Keg)", 4: "~7 days (Dehydrator)" };
    if (processingDelays[options.produce]) {
        html += '<p class="exp-warning">&#9888; Artisan goods take ' + processingDelays[options.produce] +
            ' to process before they can be sold. This delay is not modeled &mdash; actual cash is available later, so tile expansion will be slower than shown.</p>';
    }

    html += '<div class="exp-table-scroll"><table class="exp-table" cellspacing="0">';
    html += '<thead><tr>';
    html += '<th>#</th><th>Day</th><th>Action</th><th>Tiles</th>';
    html += totalCost > 0 ? '<th>Cost</th>' : '';
    html += '<th>Revenue</th><th>Balance</th>';
    html += '</tr></thead><tbody>';

    var batchColors = ['#e05c5c','#5aaae0','#50c87a','#e0c840','#b060e0','#e08830','#40c8c0','#d06090'];

    var cycleNum = 0;
    var plantCycleNum = 0;
    for (var i = 0; i < cycles.length; i++) {
        var c = cycles[i];
        cycleNum++;
        var isPlant = c.type === 'plant';
        var isRegrow = !isPlant && c.isRegrow;
        if (isPlant) plantCycleNum++;

        var rowClass = isPlant ? 'exp-row-plant' : (isRegrow ? 'exp-row-regrow' : 'exp-row-harvest');
        html += '<tr class="' + rowClass + '">';
        html += '<td>' + cycleNum + '</td>';
        html += '<td>' + formatExpansionDay(c.day) + (c.closedNote ? ' <span class="exp-note">' + c.closedNote + '</span>' : '') + '</td>';

        var batchDot = c.batchId !== undefined
            ? '<span class="exp-batch-dot" style="background:' + batchColors[c.batchId % batchColors.length] + '"></span>'
            : '';
        html += '<td>' + batchDot + (isPlant ? '&#x1F331; Plant' : (isRegrow ? '&#x1F504; Regrow' : '&#x1F33E; Harvest')) + '</td>';
        html += '<td>' + c.crops + '</td>';
        if (totalCost > 0) {
            html += '<td>' + (c.cost > 0 ? '<span class="exp-neg">-' + formatNumber(c.cost) + '</span><div class="gold"></div>' : '—') + '</td>';
        }
        html += '<td>' + (c.revenue > 0 ? '<span class="exp-pos">+' + formatNumber(c.revenue) + '</span><div class="gold"></div>' : '—') + '</td>';
        html += '<td><span class="exp-balance">' + formatNumber(c.balance) + '</span><div class="gold"></div></td>';
        html += '</tr>';
    }
    html += '</tbody></table></div>';

    tableDiv.innerHTML = html;
}

/*
 * Updates the expansion panel: populates the crop selector and renders the table.
 * Called whenever options change in expansion mode.
 */
function updateExpansionPanel() {
    var panel = document.getElementById('expansion-panel');
    if (!panel) return;

    if (!options.expansionMode) {
        panel.classList.add('hidden');
        return;
    }

    panel.classList.remove('hidden');

    // Preserve the currently selected crop name so option changes don't reset it
    var sel = document.getElementById('expansion_crop_select');
    var savedName = null;
    if (sel && sel.selectedIndex >= 0 && cropList[sel.selectedIndex]) {
        savedName = cropList[sel.selectedIndex].name;
    }

    populateExpansionCropSelector();

    // Restore selection by name (index may have changed due to resorting)
    var idx = 0;
    if (savedName && sel) {
        for (var i = 0; i < cropList.length; i++) {
            if (cropList[i].name === savedName) { idx = i; break; }
        }
        sel.value = idx;
    }

    renderExpansionTable(idx);
}

/*
 * Called once on startup to draw the UI.
 */
function initial() {
	optionsLoad();
	updateData();
	renderGraph();
}

/*
 * Called on every option change to animate the graph.
 */
function refresh() {
	updateData();
	gTitle.selectAll("*").remove();
	updateGraph();
	updateExpansionPanel();
}

/*
 * Parse out and validate the options from the URL hash.
 */
function optionsLoad() {
	if (!window.location.hash) return;

	options = deserialize(window.location.hash.slice(1));

	function validBoolean(q) {
		return q == 1;
	}

	function validIntRange(min, max, num) {
		return num < min ? min : num > max ? max : parseInt(num, 10);
	}

	options.season = validIntRange(0, 4, options.season);
	document.getElementById('select_season').value = options.season;

	options.produce = validIntRange(0, 5, options.produce);
	document.getElementById('select_produce').value = options.produce;

    options.equipment = validIntRange(0, MAX_INT, options.equipment);
    document.getElementById('equipment').value = options.equipment;

    options.sellRaw = validBoolean(options.sellRaw);
    document.getElementById('check_sellRaw').checked = options.sellRaw;

    options.sellExcess = validBoolean(options.sellExcess);
    document.getElementById('check_sellExcess').checked = options.sellExcess;

    options.byHarvest = validBoolean(options.byHarvest);
    document.getElementById('check_byHarvest').checked = options.byHarvest;

    options.aging = validIntRange(0, 3, options.aging);
    document.getElementById('select_aging').value = options.aging;

	options.planted = validIntRange(1, MAX_INT, options.planted);
	document.getElementById('number_planted').value = options.planted;

    options.maxSeedMoney = validIntRange(0, MAX_INT, options.maxSeedMoney);
    document.getElementById('max_seed_money').value = options.maxSeedMoney;

	options.average = validIntRange(0,3,options.average);
	document.getElementById('select_profit_display').checked = options.average;

    options.crossSeason = validBoolean(options.crossSeason);
    document.getElementById('cross_season').checked = options.crossSeason;

    var daysMax = 0;
    if (options.crossSeason)
        daysMax = options.season === 4 ? MAX_INT : 56;
    else
        daysMax = options.season === 4 ? MAX_INT : 28;

    options.days = validIntRange(1, daysMax, options.days);
    if (options.season === 4) {
        document.getElementById('number_days').value = options.days;
    } 
    else {
        if (options.crossSeason) {
            document.getElementById('number_days').value = 56;
            document.getElementById('current_day').value = 57 - options.days;
        }
        else {
            document.getElementById('number_days').value = 28;
            document.getElementById('current_day').value = 29 - options.days;
        }
    }

	options.seeds.pierre = validBoolean(options.seeds.pierre);
	document.getElementById('check_seedsPierre').checked = options.seeds.pierre;

	options.seeds.joja = validBoolean(options.seeds.joja);
	document.getElementById('check_seedsJoja').checked = options.seeds.joja;

	options.seeds.special = validBoolean(options.seeds.special);
	document.getElementById('check_seedsSpecial').checked = options.seeds.special;

	options.buySeed = validBoolean(options.buySeed);
	document.getElementById('check_buySeed').checked = options.buySeed;

    options.replant = validBoolean(options.replant);
    document.getElementById('check_replant').checked = options.replant;

    options.nextyear = validBoolean(options.nextyear);
    document.getElementById('check_nextyear').checked = options.nextyear;

	options.fertilizer = validIntRange(0, 6, options.fertilizer);
	document.getElementById('select_fertilizer').value = options.fertilizer;

    options.fertilizerSource = validIntRange(0, 1, options.fertilizerSource);
    document.getElementById('speed_gro_source').value = options.fertilizerSource;

	options.buyFert = validBoolean(options.buyFert);
	document.getElementById('check_buyFert').checked = options.buyFert;

	options.level = validIntRange(0, 13, options.level);
	document.getElementById('farming_level').value = options.level;

	options.skills.till = validBoolean(options.skills.till);
	document.getElementById('check_skillsTill').checked = options.skills.till;

	options.skills.agri = validBoolean(options.skills.agri);
	options.skills.arti = validBoolean(options.skills.arti);
	const binaryFlags = options.skills.agri + options.skills.arti * 2;
	document.getElementById('select_skills').value = binaryFlags;

    options.foragingLevel = validIntRange(0, 13, options.foragingLevel);
    document.getElementById('foraging_level').value = options.foragingLevel;

    options.skills.gatherer = validBoolean(options.skills.gatherer);
    document.getElementById('check_skillsGatherer').checked = options.skills.gatherer;

    options.skills.botanist = validBoolean(options.skills.botanist);
    document.getElementById('check_skillsBotanist').checked = options.skills.botanist;

	options.foodIndex = validIntRange(0, 6, options.foodIndex);
	document.getElementById('select_food').value = options.foodIndex;

	options.extra = validBoolean(options.extra);
	document.getElementById('check_extra').checked = options.extra;

	options.disableLinks = validBoolean(options.disableLinks);
	document.getElementById('disable_links').checked = options.disableLinks;
	document.getElementById('predictionModel').checked = options.predictionModel;

    options.expansionMode = validBoolean(options.expansionMode);
    document.getElementById('expansion_mode').checked = options.expansionMode;

    options.expansionCap = validIntRange(0, MAX_INT, options.expansionCap);
    document.getElementById('expansion_cap').value = options.expansionCap;

    updateSeasonNames();
}

function deserialize(str) {
    var json = `(${str})`
        .replace(/_/g, ' ')
        .replace(/-/g, ',')
        .replace(/\(/g, '{')
        .replace(/\)/g, '}')
        .replace(/([a-z]+)/gi, '"$1":')
        .replace(/"(true|false)":/gi, '$1');

    // console.log(json);

	return JSON.parse(json);
}

function serialize(obj) {

	return Object.keys(obj)
		.reduce((acc, key) => {
			return /^(?:true|false|\d+)$/i.test('' + obj[key])
				? `${acc}-${key}_${obj[key]}`
				: `${acc}-${key}_(${serialize(obj[key])})`;
		}, '')
		.slice(1);
}

/*
 * Called when changing season/seeds, to redraw the graph.
 */
function rebuild() {
	gAxis.selectAll("*").remove();
	gProfit.selectAll("*").remove();
	gSeedLoss.selectAll("*").remove();
	gFertLoss.selectAll("*").remove();
	gIcons.selectAll("*").remove();
	gTooltips.selectAll("*").remove();
	gTitle.selectAll("*").remove();

	updateData();
	renderGraph();
	updateExpansionPanel();
}

document.addEventListener('DOMContentLoaded', initial);
document.addEventListener('click', function (event) {
	if (event.target.id === 'reset') window.location = 'index.html';
});
