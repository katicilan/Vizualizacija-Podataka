const margin = {top: 30, right: 30, bottom: 60, left: 60};
const width = 1100 - margin.left - margin.right;
const height = 300 - margin.top - margin.bottom;

let globalCupsData = [];
let globalMatchesData = [];
let globalFifa2022Data = [];
let globalFifa2018Data = []; // Novi niz za podatke iz 2018.

let uniqueTeams2022 = [];
let uniqueTeams2018 = []; // Novi niz za ekipe iz 2018.
let currentSelectedYear = 2022;

// Dodana 2018. u našu glavnu navigaciju prvenstava
let targetYears = [1990, 1994, 1998, 2002, 2006, 2010, 2014, 2018, 2022];

const countryNameMap = {
    "United States of America": "USA", "England": "England", "France": "France",
    "Italy": "Italy", "Germany": "Germany FR", "Brazil": "Brazil",
    "Argentina": "Argentina", "Spain": "Spain", "Uruguay": "Uruguay", "Croatia": "Croatia"
};

// =======================================================
// 1. ASINKRONO UČITAVANJE SVIH DATOTEKA (UKLJUČUJUĆI 2018)
// =======================================================
Promise.all([
    d3.csv("WorldCups.csv"),
    d3.csv("WorldCupMatches.csv"),
    d3.csv("Fifa_world_cup_matches.csv"),
    d3.csv("world_cup_2018_stats.csv"), // Učitavanje 2018 datoteke
    d3.json("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson")
]).then(function([cups, matches, fifa2022, fifa2018, worldJson]) {
    
    // Konfiguracija općih podataka
    globalCupsData = cups.map(d => {
        d.Year = +d.Year;
        d.GoalsScored = +d.GoalsScored;
        d.Attendance = +d.Attendance.replace(/\./g, "");
        return d;
    });
    // Ručno dodavanje povijesnih podataka za unificiranu bazu
    globalCupsData.push({ Year: 2018, Country: "Russia", Winner: "France", GoalsScored: 169, MatchesPlayed: 64 });
    globalCupsData.push({ Year: 2022, Country: "Qatar", Winner: "Argentina", GoalsScored: 172, MatchesPlayed: 64 });

    const seenMatches = new Set();
    globalMatchesData = matches.filter(d => {
        if (!d.MatchID || d.MatchID.trim() === "") return false;
        if (seenMatches.has(d.MatchID)) return false;
        seenMatches.add(d.MatchID);
        d.Year = +d.Year;
        d.Attendance = d.Attendance ? +d.Attendance.replace(/\./g, "") : 0;
        return true;
    });

    // --- OBRADA I STRUKTURIRANJE 2022 PODATAKA ---
    let teams2022Set = new Set();
    globalFifa2022Data = fifa2022.map(d => {
        let t1 = d.team1.trim(); let t2 = d.team2.trim();
        teams2022Set.add(t1); teams2022Set.add(t2);
        return {
            Year: 2022, Team1: t1, Team2: t2,
            Possession1: +d["possession team1"].replace("%",""), Possession2: +d["possession team2"].replace("%",""),
            Goals1: +d["number of goals team1"], Goals2: +d["number of goals team2"],
            Attempts1: +d["total attempts team1"], Attempts2: +d["total attempts team2"],
            OnTarget1: +d["on target attempts team1"], OnTarget2: +d["on target attempts team2"],
            Fouls1: +d["fouls against team1"], Fouls2: +d["fouls against team2"],
            Yellow1: +d["yellow cards team1"], Yellow2: +d["yellow cards team2"],
            Category: d.category, Matchup: `${t1} vs ${t2}`
        };
    });
    uniqueTeams2022 = Array.from(teams2022Set).sort();

    // --- OBRADA I STRUKTURIRANJE 2018 PODATAKA ---
    let teams2018Set = new Set();
    globalFifa2018Data = fifa2018.map(d => {
        let teamName = d.Team.trim().toUpperCase(); // Normalizacija imena u velika slova radi lakše pretrage
        teams2018Set.add(teamName);
        return {
            Year: 2018,
            Team: teamName,
            Opponent: d.Opponent.trim().toUpperCase(),
            Stage: d.Group, // Sadrži fazu natjecanja ili grupu
            GoalsFor: +d["Goals For"],
            GoalsAgainst: +d["Goals Against"],
            Possession: +d["Ball possession %"],
            Attempts: +d.Attempts,
            OnTarget: +d["On-Target"],
            Fouls: +d["Fouls Committed"],
            YellowCards: +d["Yellow cards"],
            Label: `vs ${d.Opponent.trim().toUpperCase()} (${d.Group})`
        };
    });
    uniqueTeams2018 = Array.from(teams2018Set).sort();

    // Event listener za dropdown izbornik ekipa
    d3.select("#team-select").on("change", function() {
        renderAdvancedDashboard(this.value, currentSelectedYear);
    });

    // Generiranje navigacije
    const navBar = d3.select("#nav-bar");
    targetYears.forEach(year => {
        navBar.append("button").attr("class", "nav-btn").attr("id", "btn-" + year).text(year + ".").on("click", () => switchScreen(year));
    });

    drawWorldMap(worldJson);
}).catch(err => console.error(err));


function switchScreen(screenType) {
    d3.selectAll(".nav-btn").classed("active", false);
    
    if (screenType === 'general') {
        d3.select(".navbar button").classed("active", true);
        d3.select("#screen-general").classed("hidden", false);
        d3.select("#screen-yearly").classed("hidden", true);
    } else {
        currentSelectedYear = screenType;
        d3.select("#btn-" + screenType).classed("active", true);
        d3.select("#screen-general").classed("hidden", true);
        d3.select("#screen-yearly").classed("hidden", false);
        
        // Provjera radi li se o naprednim godinama s modulom filtracije (2018 ili 2022)
        let isAdvancedYear = (screenType === 2018 || screenType === 2022);
        d3.select("#filter-container-advanced").classed("hidden", !isAdvancedYear);
        d3.select("#extra-charts-advanced").classed("hidden", !isAdvancedYear);
        
        renderYearlyScreen(screenType);
    }
}

// =======================================================
// 2. KARTA SVIJETA (ZOOM I SVEUKUPNA STATISTIKA)
// =======================================================
function drawWorldMap(geoData) {
    const mapWidth = 750, mapHeight = 400;
    const svg = d3.select("#world-map").append("svg").attr("width", mapWidth).attr("height", mapHeight);
    const g = svg.append("g");
    const projection = d3.geoMercator().scale(110).translate([mapWidth / 2, mapHeight / 1.4]);
    const pathGenerator = d3.geoPath().projection(projection);

    const zoomBehavior = d3.zoom().scaleExtent([1, 8]).on("zoom", (event) => g.attr("transform", event.transform));
    svg.call(zoomBehavior);

    svg.on("click", function(event) {
        if (event.target.tagName === "svg") {
            svg.transition().duration(750).call(zoomBehavior.transform, d3.zoomIdentity);
        }
    });

    let winnersCount = {};
    globalCupsData.forEach(d => { winnersCount[d.Winner] = (winnersCount[d.Winner] || 0) + 1; });

    g.selectAll(".country").data(geoData.features).enter().append("path").attr("class", "country").attr("d", pathGenerator)
        .attr("fill", d => {
            let csvName = countryNameMap[d.properties.NAME] || d.properties.NAME;
            if (winnersCount[csvName]) {
                if (winnersCount[csvName] >= 5) return "#d69e2e";
                if (winnersCount[csvName] >= 3) return "#2f855a";
                return "#48bb78";
            }
            return "#cbd5e0";
        })
        .on("mouseover", function(event, d) {
            let csvName = countryNameMap[d.properties.NAME] || d.properties.NAME;
            d3.select("#tooltip").style("left", (event.pageX + 10) + "px").style("top", (event.pageY - 10) + "px").select("#tooltip-value").html(`<b>${d.properties.NAME}</b><br>Naslova: ${winnersCount[csvName] || 0}`);
            d3.select("#tooltip").classed("hidden", false);
        })
        .on("mouseout", () => d3.select("#tooltip").classed("hidden", true))
        .on("click", function(event, d) {
            event.stopPropagation();
            const bounds = pathGenerator.bounds(d);
            const dx = bounds[1][0] - bounds[0][0], dy = bounds[1][1] - bounds[0][1];
            const x = (bounds[0][0] + bounds[1][0]) / 2, y = (bounds[0][1] + bounds[1][1]) / 2;
            const scale = Math.max(1, Math.min(8, 0.9 / Math.max(dx / mapWidth, dy / mapHeight)));
            svg.transition().duration(750).call(zoomBehavior.transform, d3.zoomIdentity.translate(mapWidth / 2 - scale * x, mapHeight / 2 - scale * y).scale(scale));

            let geoName = d.properties.NAME, csvName = countryNameMap[geoName] || geoName;
            let odigranoUtakmica = 0, zabijenoGolova = 0;

            globalMatchesData.forEach(m => {
                if (m["Home Team Name"] === csvName) { odigranoUtakmica++; zabijenoGolova += +m["Home Team Goals"]; }
                else if (m["Away Team Name"] === csvName) { odigranoUtakmica++; zabijenoGolova += +m["Away Team Goals"]; }
            });
            globalFifa2018Data.forEach(m => {
                if (m.Team === csvName.toUpperCase()) { odigranoUtakmica++; zabijenoGolova += m.GoalsFor; }
            });
            globalFifa2022Data.forEach(m => {
                if (m.Team1 === csvName.toUpperCase() || m.Team1 === csvName) { odigranoUtakmica++; zabijenoGolova += m.Goals1; }
                if (m.Team2 === csvName.toUpperCase() || m.Team2 === csvName) { odigranoUtakmica++; zabijenoGolova += m.Goals2; }
            });

            d3.select("#sidebar-content").html(`
                <div class="stat-box">
                    <p>⚽ <b>Reprezentacija:</b> <br><span class="stat-number">${geoName}</span></p>
                    <p>🏆 <b>Naslova prvaka:</b> <br><span class="stat-number" style="color:#b7791f;">${winnersCount[csvName] || 0}</span></p>
                    <p>🔢 <b>Ukupno mečeva (1990-2022):</b> <br><span class="stat-number">${odigranoUtakmica}</span></p>
                    <p>🥅 <b>Ukupno golova (1990-2022):</b> <br><span class="stat-number" style="color:#48bb78;">${zabijenoGolova}</span></p>
                </div>
            `);
        });
}

// =======================================================
// 3. UPRAVLJANJE DROPDOWN POPISOM PO GODINAMA
// =======================================================
function updateTeamDropdown(year) {
    const select = d3.select("#team-select");
    select.html(""); // Obriši stare opcije

    let teamsList = (year === 2018) ? uniqueTeams2018 : uniqueTeams2022;
    
    teamsList.forEach(team => {
        select.append("option").attr("value", team).text(team);
    });

    // Postavi inicijalnu selekciju ovisno o godini
    if (year === 2018) select.property("value", "CROATIA");
    else select.property("value", "ARGENTINA");
}

function renderYearlyScreen(year) {
    const cup = globalCupsData.find(d => d.Year === year);
    d3.select("#yearly-title").text(`Službeni podaci za Svjetsko Prvenstvo ${year}. godine`);
    if (cup) {
        d3.select("#cup-info-stats").html(`
            <p>📍 <b>Domaćin:</b> ${cup.Country} &nbsp;&nbsp;|&nbsp;&nbsp; 🏆 <b>Prvak:</b> ${cup.Winner} &nbsp;&nbsp;|&nbsp;&nbsp; ⚽ <b>Golova:</b> ${cup.GoalsScored}</p>
        `);
    }

    if (year === 2018 || year === 2022) {
        updateTeamDropdown(year);
        let activeTeam = d3.select("#team-select").property("value");
        renderAdvancedDashboard(activeTeam, year);
    } else {
        // Grafikon posjećenosti za godine 1990-2014
        d3.select("#chart1-title").text("Top 10 najgledanijih utakmica prvenstva");
        d3.select("#chart1").html("");
        let chartData = globalMatchesData.filter(d => d.Year === year).sort((a, b) => b.Attendance - a.Attendance).slice(0, 10);
        const svg = d3.select("#chart1").append("svg").attr("width", width + margin.left + margin.right).attr("height", height + margin.top + margin.bottom).append("g").attr("transform", `translate(150,${margin.top})`);
        const x = d3.scaleLinear().domain([0, d3.max(chartData, d => d.Attendance)]).range([0, width - 150]);
        const y = d3.scaleBand().domain(chartData.map(d => `${d["Home Team Name"]} vs ${d["Away Team Name"]}`)).range([0, height]).padding(0.2);
        svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x));
        svg.append("g").call(d3.axisLeft(y));
        svg.selectAll(".bar").data(chartData).enter().append("rect").attr("class", "nav-btn").attr("y", d => y(`${d["Home Team Name"]} vs ${d["Away Team Name"]}`)).attr("height", y.bandwidth()).transition().duration(300).attr("width", d => x(d.Attendance));
    }
}

// =======================================================
// 4. UNIFICIRANI UNIVERZALNI DASHBOARD (ZA 2018 I 2022)
// =======================================================
function renderAdvancedDashboard(selectedTeam, year) {
    let profileData = [];

    if (year === 2018) {
        // Za 2018. samo izvuci već filtrirane podatke iz globalnog niza
        profileData = globalFifa2018Data.filter(d => d.Team === selectedTeam);
    } else {
        // Za 2022. presloži strukturu utakmica s obzirom na Team1/Team2
        let matches2022 = globalFifa2022Data.filter(d => d.Team1 === selectedTeam || d.Team2 === selectedTeam);
        profileData = matches2022.map(m => {
            let isTeam1 = (m.Team1 === selectedTeam);
            return {
                Year: 2022, Team: selectedTeam, Opponent: isTeam1 ? m.Team2 : m.Team1, Stage: m.Category,
                GoalsFor: isTeam1 ? m.Goals1 : m.Goals2, GoalsAgainst: isTeam1 ? m.Goals2 : m.Goals1,
                Possession: isTeam1 ? m.Possession1 : m.Possession2, Attempts: isTeam1 ? m.Attempts1 : m.Attempts2,
                OnTarget: isTeam1 ? m.OnTarget1 : m.OnTarget2, Fouls: isTeam1 ? m.Fouls1 : m.Fouls2,
                YellowCards: isTeam1 ? m.Yellow1 : m.Yellow2, Label: isTeam1 ? `vs ${m.Team2} (${m.Category})` : `vs ${m.Team1} (${m.Category})`
            };
        });
    }

    // Čišćenje starih grafova
    d3.select("#chart1").html(""); d3.select("#chart2-possession").html(""); d3.select("#chart3-attempts").html(""); d3.select("#chart4-discipline").html("");
    const localWidth = width - 100;

    // --- GRAFIKON 1: GOLOVI ---
    d3.select("#chart1-title").text(`Grafikon 1: Golovi reprezentacije ${selectedTeam} (${year}.)`);
    const svg1 = d3.select("#chart1").append("svg").attr("width", localWidth + 160).attr("height", height + margin.top + margin.bottom).append("g").attr("transform", `translate(120,${margin.top})`);
    const x1 = d3.scaleBand().domain(profileData.map(d => d.Label)).range([0, localWidth]).padding(0.3);
    const y1 = d3.scaleLinear().domain([0, d3.max(profileData, d => Math.max(d.GoalsFor, d.GoalsAgainst)) + 1]).range([height, 0]);
    const xSubGroup = d3.scaleBand().domain(['For', 'Against']).range([0, x1.bandwidth()]).padding(0.05);
    svg1.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x1)).selectAll("text").style("text-anchor", "end").attr("transform", "rotate(-15)");
    svg1.append("g").call(d3.axisLeft(y1).ticks(5));
    svg1.selectAll(".bar-for").data(profileData).enter().append("rect").attr("class", "bar-goals-for").attr("x", d => x1(d.Label) + xSubGroup('For')).attr("y", d => y1(d.GoalsFor)).attr("width", xSubGroup.bandwidth()).attr("height", d => height - y1(d.GoalsFor));
    svg1.selectAll(".bar-against").data(profileData).enter().append("rect").attr("class", "bar-goals-against").attr("x", d => x1(d.Label) + xSubGroup('Against')).attr("y", d => y1(d.GoalsAgainst)).attr("width", xSubGroup.bandwidth()).attr("height", d => height - y1(d.GoalsAgainst));

    // --- GRAFIKON 2: POSJED LOPTE ---
    const svg2 = d3.select("#chart2-possession").append("svg").attr("width", localWidth + 160).attr("height", height + margin.top + margin.bottom).append("g").attr("transform", `translate(120,${margin.top})`);
    const y2 = d3.scaleLinear().domain([0, 100]).range([height, 0]);
    svg2.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x1)).selectAll("text").style("text-anchor", "end").attr("transform", "rotate(-15)");
    svg2.append("g").call(d3.axisLeft(y2).tickFormat(d => d + "%"));
    const lineGen = d3.line().x(d => x1(d.Label) + x1.bandwidth()/2).y(d => y2(d.Possession));
    svg2.append("path").datum(profileData).attr("class", "line-possession").attr("d", lineGen);
    svg2.selectAll(".dot-possession").data(profileData).enter().append("circle").attr("class", "dot-possession").attr("cx", d => x1(d.Label) + x1.bandwidth()/2).attr("cy", d => y2(d.Possession)).attr("r", 6)
        .on("mouseover", function(event, d) { d3.select("#tooltip").style("left", (event.pageX + 10) + "px").style("top", (event.pageY - 10) + "px").select("#tooltip-value").html(`<b>Posjed:</b> ${d.Possession}%`); d3.select("#tooltip").classed("hidden", false); })
        .on("mouseout", () => d3.select("#tooltip").classed("hidden", true));

    // --- GRAFIKON 3: UDARCI ---
    const svg3 = d3.select("#chart3-attempts").append("svg").attr("width", localWidth + 160).attr("height", height + margin.top + margin.bottom).append("g").attr("transform", `translate(120,${margin.top})`);
    const y3 = d3.scaleLinear().domain([0, d3.max(profileData, d => d.Attempts) + 3]).range([height, 0]);
    const xSubGroup3 = d3.scaleBand().domain(['Total', 'Target']).range([0, x1.bandwidth()]).padding(0.05);
    svg3.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x1)).selectAll("text").style("text-anchor", "end").attr("transform", "rotate(-15)");
    svg3.append("g").call(d3.axisLeft(y3));
    svg3.selectAll(".bar-tot").data(profileData).enter().append("rect").attr("class", "bar-attempts-total").attr("x", d => x1(d.Label) + xSubGroup3('Total')).attr("y", d => y3(d.Attempts)).attr("width", xSubGroup3.bandwidth()).attr("height", d => height - y3(d.Attempts));
    svg3.selectAll(".bar-tar").data(profileData).enter().append("rect").attr("class", "bar-attempts-target").attr("x", d => x1(d.Label) + xSubGroup3('Target')).attr("y", d => y3(d.OnTarget)).attr("width", xSubGroup3.bandwidth()).attr("height", d => height - y3(d.OnTarget));

    // --- GRAFIKON 4: DISCIPLINA ---
    const svg4 = d3.select("#chart4-discipline").append("svg").attr("width", localWidth + 160).attr("height", height + margin.top + margin.bottom).append("g").attr("transform", `translate(120,${margin.top})`);
    const x4 = d3.scaleLinear().domain([0, d3.max(profileData, d => d.Fouls) + 2]).range([0, localWidth]);
    const y4 = d3.scaleLinear().domain([0, d3.max(profileData, d => d.YellowCards) + 1]).range([height, 0]);
    svg4.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x4).ticks(10));
    svg4.append("g").call(d3.axisLeft(y4).ticks(5));
    svg4.append("text").attr("x", localWidth / 2).attr("y", height + 40).style("text-anchor", "middle").text("Broj napravljenih prekršaja (Fouls)");
    svg4.append("text").attr("transform", "rotate(-90)").attr("y", -40).attr("x", -height / 2).style("text-anchor", "middle").text("Žuti kartoni");
    svg4.selectAll(".dot-discipline").data(profileData).enter().append("circle").attr("class", "dot-discipline").attr("cx", d => x4(d.Fouls)).attr("cy", d => y4(d.YellowCards)).attr("r", 8)
        .on("mouseover", function(event, d) { d3.select("#tooltip").style("left", (event.pageX + 10) + "px").style("top", (event.pageY - 10) + "px").select("#tooltip-value").html(`<b>Utakmica:</b> ${d.Label}<br><b>Prekršaji:</b> ${d.Fouls}<br><b>Žuti kartoni:</b> ${d.YellowCards}`); d3.select("#tooltip").classed("hidden", false); })
        .on("mouseout", () => d3.select("#tooltip").classed("hidden", true));
}