// =======================================================
// KONFIGURACIJA PROSTORA I DIMENZIJA GRAFIKONA
// =======================================================
const margin = {top: 30, right: 30, bottom: 60, left: 60};
const width = 1100 - margin.left - margin.right;
const height = 300 - margin.top - margin.bottom;

// Globalne varijable za spremanje učitanih podataka
let globalCupsData = [];
let globalMatchesData = [];
let globalFifa2022Data = [];
let globalFifa2018Data = [];
let currentSelectedYear = 1990;

// Godine koje podržavamo u navigaciji
let targetYears = [1990, 1994, 1998, 2002, 2006, 2010, 2014, 2018, 2022];

// Mapiranje specifičnih naziva s karte na nazive u CSV datotekama
const countryNameMap = {
    "United States of America": "USA", 
    "England": "England", 
    "France": "France",
    "Italy": "Italy", 
    "Germany": "Germany FR", 
    "Brazil": "Brazil",
    "Argentina": "Argentina", 
    "Spain": "Spain", 
    "Uruguay": "Uruguay", 
    "Croatia": "Croatia"
};

// =======================================================
// 1. ASINKRONO UČITAVANJE SVIH DATOTEKA
// =======================================================
Promise.all([
    d3.csv("WorldCups.csv"),
    d3.csv("WorldCupMatches.csv"),
    d3.csv("Fifa_world_cup_matches.csv"),
    d3.csv("world_cup_2018_stats.csv"),
    d3.json("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson")
]).then(function([cups, matches, fifa2022, fifa2018, worldJson]) {
    
    // 1.1. Obrada općih podataka o prvenstvima
    globalCupsData = cups.map(d => {
        d.Year = +d.Year;
        d.GoalsScored = +d.GoalsScored;
        d.Attendance = +d.Attendance.replace(/\./g, "");
        return d;
    });
    // Ručno dodavanje unificiranih podataka za 2018. i 2022. u opću tablicu
    globalCupsData.push({ Year: 2018, Country: "Russia", Winner: "France", GoalsScored: 169, MatchesPlayed: 64 });
    globalCupsData.push({ Year: 2022, Country: "Qatar", Winner: "Argentina", GoalsScored: 172, MatchesPlayed: 64 });

    // 1.2. Obrada povijesnih utakmica (1990 - 2014) i uklanjanje duplikata
    const seenMatches = new Set();
    globalMatchesData = matches.filter(d => {
        if (!d.MatchID || d.MatchID.trim() === "") return false;
        if (seenMatches.has(d.MatchID)) return false;
        seenMatches.add(d.MatchID);
        d.Year = +d.Year;
        d.Attendance = d.Attendance ? +d.Attendance.replace(/\./g, "") : 0;
        return true;
    });

    // 1.3. Strukturiranje i normalizacija podataka za 2022. godinu
    globalFifa2022Data = fifa2022.map(d => {
        return {
            Year: 2022, Team1: d.team1.trim(), Team2: d.team2.trim(),
            Possession1: +d["possession team1"].replace("%",""), Possession2: +d["possession team2"].replace("%",""),
            Goals1: +d["number of goals team1"], Goals2: +d["number of goals team2"],
            Attempts1: +d["total attempts team1"], Attempts2: +d["total attempts team2"],
            OnTarget1: +d["on target attempts team1"], OnTarget2: +d["on target attempts team2"],
            Fouls1: +d["fouls against team1"], Fouls2: +d["fouls against team2"],
            Yellow1: +d["yellow cards team1"], Yellow2: +d["yellow cards team2"],
            Category: d.category, Matchup: `${d.team1.trim()} vs ${d.team2.trim()}`
        };
    });

    // 1.4. Strukturiranje i normalizacija podataka za 2018. godinu
    globalFifa2018Data = fifa2018.map(d => {
        return {
            Year: 2018, Team: d.Team.trim(), Opponent: d.Opponent.trim(), Stage: d.Group,
            GoalsFor: +d["Goals For"], GoalsAgainst: +d["Goals Against"],
            Possession: +d["Ball possession %"], Attempts: +d.Attempts,
            OnTarget: +d["On-Target"], Fouls: +d["Fouls Committed"],
            YellowCards: +d["Yellow cards"], Label: `vs ${d.Opponent.trim()} (${d.Group})`
        };
    });

    // Event listener za promjenu reprezentacije u dropdownu
    d3.select("#team-select").on("change", function() {
        renderUniversalDashboard(this.value, currentSelectedYear);
    });

    // Dinamičko generiranje gumba u navigaciji za svaku godinu
    const navBar = d3.select("#nav-bar");
    targetYears.forEach(year => {
        navBar.append("button")
            .attr("class", "nav-btn")
            .attr("id", "btn-" + year)
            .text(year + ".")
            .on("click", () => switchScreen(year));
    });

    // Pokretanje crtanja karte svijeta
    drawWorldMap(worldJson);

}).catch(err => console.error("Greška pri učitavanju podataka:", err));


// =======================================================
// ZASLONI I NAVIGACIJA
// =======================================================
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
        
        renderYearlyScreen(screenType);
    }
}

// =======================================================
// 2. KARTA SVIJETA (S POPRAVLJENOM SINKRONIZACIJOM IMENA)
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

    // Izračun broja naslova prvaka za bojanje država
    let winnersCount = {};
    globalCupsData.forEach(d => { winnersCount[d.Winner] = (winnersCount[d.Winner] || 0) + 1; });

    g.selectAll(".country").data(geoData.features).enter().append("path").attr("class", "country").attr("d", pathGenerator)
        .attr("fill", d => {
            let csvName = countryNameMap[d.properties.NAME] || d.properties.NAME;
            if (winnersCount[csvName]) return winnersCount[csvName] >= 5 ? "#d69e2e" : (winnersCount[csvName] >= 3 ? "#2f855a" : "#48bb78");
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
            
            // Zoom animacija na državu
            const bounds = pathGenerator.bounds(d);
            const dx = bounds[1][0] - bounds[0][0], dy = bounds[1][1] - bounds[0][1];
            const scale = Math.max(1, Math.min(8, 0.9 / Math.max(dx / mapWidth, dy / mapHeight)));
            svg.transition().duration(750).call(zoomBehavior.transform, d3.zoomIdentity.translate(mapWidth / 2 - scale * ((bounds[0][0] + bounds[1][0]) / 2), mapHeight / 2 - scale * ((bounds[0][1] + bounds[1][1]) / 2)).scale(scale));

            // SINKRONIZACIJA SLOVA: Prebacivanje u velika slova radi sigurnog spajanja datoteka
            let geoName = d.properties.NAME;
            let csvName = countryNameMap[geoName] || geoName;
            let searchNameUpper = csvName.toUpperCase();

            let odigranoUtakmica = 0;
            let zabijenoGolova = 0;

            // 1. Zbrajanje kroz povijesne podatke (1990-2014)
            globalMatchesData.forEach(m => {
                let homeUpper = m["Home Team Name"] ? m["Home Team Name"].toUpperCase() : "";
                let awayUpper = m["Away Team Name"] ? m["Away Team Name"].toUpperCase() : "";

                if (homeUpper === searchNameUpper) { 
                    odigranoUtakmica++; 
                    zabijenoGolova += (+m["Home Team Goals"] || 0); 
                } else if (awayUpper === searchNameUpper) { 
                    odigranoUtakmica++; 
                    zabijenoGolova += (+m["Away Team Goals"] || 0); 
                }
            });

            // 2. Zbrajanje kroz 2018. godinu
            globalFifa2018Data.forEach(m => {
                let teamUpper = m.Team ? m.Team.toUpperCase() : "";
                if (teamUpper === searchNameUpper) { 
                    odigranoUtakmica++; 
                    zabijenoGolova += (m.GoalsFor || 0); 
                }
            });

            // 3. Zbrajanje kroz 2022. godinu
            globalFifa2022Data.forEach(m => {
                let t1Upper = m.Team1 ? m.Team1.toUpperCase() : "";
                let t2Upper = m.Team2 ? m.Team2.toUpperCase() : "";

                if (t1Upper === searchNameUpper) { 
                    odigranoUtakmica++; 
                    zabijenoGolova += (m.Goals1 || 0); 
                } else if (t2Upper === searchNameUpper) { 
                    odigranoUtakmica++; 
                    zabijenoGolova += (m.Goals2 || 0); 
                }
            });

            // ISPIS REZULTATA U DESNI PANEL (SIDEBAR)
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
// 3. UPRAVLJANJE DROPDOWN POPISOM ZA SVE GODINE
// =======================================================
function updateTeamDropdownUniversal(year) {
    const select = d3.select("#team-select");
    select.html(""); 
    let teamsSet = new Set();

    if (year === 2022) {
        globalFifa2022Data.forEach(m => { teamsSet.add(m.Team1); teamsSet.add(m.Team2); });
    } else if (year === 2018) {
        globalFifa2018Data.forEach(m => { teamsSet.add(m.Team); });
    } else {
        globalMatchesData.filter(m => m.Year === year).forEach(m => {
            if(m["Home Team Name"]) teamsSet.add(m["Home Team Name"]);
            if(m["Away Team Name"]) teamsSet.add(m["Away Team Name"]);
        });
    }

    let sortedTeams = Array.from(teamsSet).sort();
    sortedTeams.forEach(team => { select.append("option").attr("value", team).text(team); });

    // Postavljanje početnog selektiranog tima ovisno o godini
    if (year === 2022) select.property("value", "Argentina");
    else if (year === 2018) select.property("value", "Croatia");
    else if (year === 2014) select.property("value", "Germany");
    else if (year === 2010) select.property("value", "Spain");
    else if (year === 2006) select.property("value", "Italy");
    else if (year === 2002) select.property("value", "Brazil");
    else if (year === 1998) select.property("value", "France");
    else if (year === 1994) select.property("value", "Brazil");
    else if (year === 1990) select.property("value", "Germany FR");
}

function renderYearlyScreen(year) {
    const cup = globalCupsData.find(d => d.Year === year);
    d3.select("#yearly-title").text(`Službeni podaci za Svjetsko Prvenstvo ${year}. godine`);
    if (cup) {
        d3.select("#cup-info-stats").html(`<p>📍 <b>Domaćin:</b> ${cup.Country} &nbsp;&nbsp;|&nbsp;&nbsp; 🏆 <b>Prvak:</b> ${cup.Winner} &nbsp;&nbsp;|&nbsp;&nbsp; ⚽ <b>Golova:</b> ${cup.GoalsScored}</p>`);
    }

    updateTeamDropdownUniversal(year);
    let activeTeam = d3.select("#team-select").property("value");
    renderUniversalDashboard(activeTeam, year);
}

// =======================================================
// 4. UNIVERZALNI DASHBOARD S 4 GRAFIKONA ZA SVE GODINE
// =======================================================
function renderUniversalDashboard(selectedTeam, year) {
    let profileData = [];
    let isAdvanced = (year === 2018 || year === 2022);

    // Standardizacija i unifikacija formata podataka iz različitih CSV datoteka
    if (year === 2022) {
        profileData = globalFifa2022Data.filter(d => d.Team1 === selectedTeam || d.Team2 === selectedTeam).map(m => {
            let isTeam1 = (m.Team1 === selectedTeam);
            return {
                Label: `vs ${isTeam1 ? m.Team2 : m.Team1} (${m.Category})`,
                GoalsFor: isTeam1 ? m.Goals1 : m.Goals2, GoalsAgainst: isTeam1 ? m.Goals2 : m.Goals1,
                Param2: isTeam1 ? m.Possession1 : m.Possession2, 
                Param3_1: isTeam1 ? m.Attempts1 : m.Attempts2, Param3_2: isTeam1 ? m.OnTarget1 : m.OnTarget2, 
                Param4_1: isTeam1 ? m.Fouls1 : m.Fouls2, Param4_2: isTeam1 ? m.Yellow1 : m.Yellow2 
            };
        });
    } else if (year === 2018) {
        profileData = globalFifa2018Data.filter(d => d.Team === selectedTeam).map(m => {
            return {
                Label: m.Label, GoalsFor: m.GoalsFor, GoalsAgainst: m.GoalsAgainst,
                Param2: m.Possession, Param3_1: m.Attempts, Param3_2: m.OnTarget,
                Param4_1: m.Fouls, Param4_2: m.YellowCards
            };
        });
    } else {
        // Generiranje podataka za povijesne godine (1990 - 2014)
        profileData = globalMatchesData.filter(m => m.Year === year && (m["Home Team Name"] === selectedTeam || m["Away Team Name"] === selectedTeam)).map(m => {
            let isHome = (m["Home Team Name"] === selectedTeam);
            return {
                Label: `vs ${isHome ? m["Away Team Name"] : m["Home Team Name"]} (${m.Stage.split(' ')[0]})`,
                GoalsFor: isHome ? +m["Home Team Goals"] : +m["Away Team Goals"],
                GoalsAgainst: isHome ? +m["Away Team Goals"] : +m["Home Team Goals"],
                Param2: +m.Attendance, 
                Param3_1: isHome ? +m["Half-time Home Goals"] : +m["Half-time Away Goals"], 
                Param3_2: isHome ? +m["Half-time Away Goals"] : +m["Half-time Home Goals"],
                Param4_1: (+m["Home Team Goals"] + +m["Away Team Goals"]), 
                Param4_2: +m.Attendance 
            };
        });
    }

    // Čišćenje starih grafikona iz kontejnera
    d3.select("#chart1").html(""); d3.select("#chart2").html(""); d3.select("#chart3").html(""); d3.select("#chart4").html("");
    const localWidth = width - 100;

    // --- GRAFIKON 1: GOLOVI (Zajednički za sve godine) ---
    d3.select("#chart1-title").text(`Grafikon 1: Golovi reprezentacije ${selectedTeam} kroz turnir`);
    const svg1 = d3.select("#chart1").append("svg").attr("width", localWidth + 160).attr("height", height + margin.top + margin.bottom).append("g").attr("transform", `translate(120,${margin.top})`);
    const x1 = d3.scaleBand().domain(profileData.map(d => d.Label)).range([0, localWidth]).padding(0.3);
    const y1 = d3.scaleLinear().domain([0, d3.max(profileData, d => Math.max(d.GoalsFor, d.GoalsAgainst)) + 1 || 5]).range([height, 0]);
    const xSubGroup = d3.scaleBand().domain(['For', 'Against']).range([0, x1.bandwidth()]).padding(0.05);
    
    svg1.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x1)).selectAll("text").style("text-anchor", "end").attr("transform", "rotate(-15)");
    svg1.append("g").call(d3.axisLeft(y1).ticks(5));
    svg1.selectAll(".bar-for").data(profileData).enter().append("rect").attr("class", "bar-goals-for").attr("x", d => x1(d.Label) + xSubGroup('For')).attr("y", d => y1(d.GoalsFor)).attr("width", xSubGroup.bandwidth()).attr("height", d => height - y1(d.GoalsFor));
    svg1.selectAll(".bar-against").data(profileData).enter().append("rect").attr("class", "bar-goals-against").attr("x", d => x1(d.Label) + xSubGroup('Against')).attr("y", d => y1(d.GoalsAgainst)).attr("width", xSubGroup.bandwidth()).attr("height", d => height - y1(d.GoalsAgainst));

    // --- GRAFIKON 2: POSJED (2018/2022) ILI GLEDANOST (1990-2014) ---
     Kleid = d3.select("#chart2-title").text(isAdvanced ? `Grafikon 2: Kretanje posjeda lopte (%)` : `Grafikon 2: Gledanost utakmica na stadionima`);
    const svg2 = d3.select("#chart2").append("svg").attr("width", localWidth + 160).attr("height", height + margin.top + margin.bottom).append("g").attr("transform", `translate(120,${margin.top})`);
    const y2 = d3.scaleLinear().domain(isAdvanced ? [0, 100] : [0, d3.max(profileData, d => d.Param2) * 1.1 || 100000]).range([height, 0]);
    
    svg2.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x1)).selectAll("text").style("text-anchor", "end").attr("transform", "rotate(-15)");
    svg2.append("g").call(d3.axisLeft(y2).tickFormat(d => isAdvanced ? d + "%" : d.toLocaleString()));
    const lineGen = d3.line().x(d => x1(d.Label) + x1.bandwidth()/2).y(d => y2(d.Param2));
    svg2.append("path").datum(profileData).attr("class", "line-possession").attr("d", lineGen);
    svg2.selectAll(".dot-possession").data(profileData).enter().append("circle").attr("class", "dot-possession").attr("cx", d => x1(d.Label) + x1.bandwidth()/2).attr("cy", d => y2(d.Param2)).attr("r", 6)
        .on("mouseover", function(event, d) { d3.select("#tooltip").style("left", (event.pageX + 10) + "px").style("top", (event.pageY - 10) + "px").select("#tooltip-value").html(isAdvanced ? `<b>Posjed:</b> ${d.Param2}%` : `<b>Gledatelja:</b> ${d.Param2.toLocaleString()}`); d3.select("#tooltip").classed("hidden", false); })
        .on("mouseout", () => d3.select("#tooltip").classed("hidden", true));

    // --- GRAFIKON 3: UDARCI (2018/2022) ILI POLUVRIJEME GOLOVI (1990-2014) ---
    d3.select("#chart3-title").text(isAdvanced ? `Grafikon 3: Odnos ukupnih udaraca i udaraca u okvir` : `Grafikon 3: Golovi tima na poluvremenu (Plavo) vs Primljeni golovi na poluvremenu (Narančasto)`);
    const svg3 = d3.select("#chart3").append("svg").attr("width", localWidth + 160).attr("height", height + margin.top + margin.bottom).append("g").attr("transform", `translate(120,${margin.top})`);
    const y3 = d3.scaleLinear().domain([0, d3.max(profileData, d => Math.max(d.Param3_1, d.Param3_2)) + 3 || 10]).range([height, 0]);
    const xSubGroup3 = d3.scaleBand().domain(['T1', 'T2']).range([0, x1.bandwidth()]).padding(0.05);
    
    svg3.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x1)).selectAll("text").style("text-anchor", "end").attr("transform", "rotate(-15)");
    svg3.append("g").call(d3.axisLeft(y3).ticks(5));
    svg3.selectAll(".bar-p31").data(profileData).enter().append("rect").attr("class", "bar-attempts-total").attr("x", d => x1(d.Label) + xSubGroup3('T1')).attr("y", d => y3(d.Param3_1)).attr("width", xSubGroup3.bandwidth()).attr("height", d => height - y3(d.Param3_1));
    svg3.selectAll(".bar-p32").data(profileData).enter().append("rect").attr("class", "bar-attempts-target").attr("x", d => x1(d.Label) + xSubGroup3('T2')).attr("y", d => y3(d.Param3_2)).attr("width", xSubGroup3.bandwidth()).attr("height", d => height - y3(d.Param3_2));

    // --- GRAFIKON 4: FAULOVI/KARTONI (2018/2022) ILI SCATTER GOLOVI/GLEDANOST (1990-2014) ---
    d3.select("#chart4-title").text(isAdvanced ? `Grafikon 4: Disciplina - Odnos prekršaja i žutih kartona` : `Grafikon 4: Korelacija - Odnos ukupnog broja golova na utakmici (X) i gledanosti (Y)`);
    const svg4 = d3.select("#chart4").append("svg").attr("width", localWidth + 160).attr("height", height + margin.top + margin.bottom).append("g").attr("transform", `translate(120,${margin.top})`);
    const x4 = d3.scaleLinear().domain([0, d3.max(profileData, d => d.Param4_1) + 2 || 15]).range([0, localWidth]);
    const y4 = d3.scaleLinear().domain([0, d3.max(profileData, d => d.Param4_2) * 1.1 || 10]).range([height, 0]);
    
    svg4.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x4));
    svg4.append("g").call(d3.axisLeft(y4).tickFormat(d => isAdvanced ? d : d.toLocaleString()));
    
    svg4.append("text").attr("x", localWidth / 2).attr("y", height + 40).style("text-anchor", "middle").text(isAdvanced ? "Broj napravljenih prekršaja (Fouls)" : "Ukupno golova postignuto na toj utakmici");
    svg4.append("text").attr("transform", "rotate(-90)").attr("y", -50).attr("x", -height / 2).style("text-anchor", "middle").text(isAdvanced ? "Žuti kartoni" : "Gledanost stadiona");
    
    svg4.selectAll(".dot-discipline").data(profileData).enter().append("circle").attr("class", "dot-discipline").attr("cx", d => x4(d.Param4_1)).attr("cy", d => y4(d.Param4_2)).attr("r", 8)
        .on("mouseover", function(event, d) { 
            d3.select("#tooltip").style("left", (event.pageX + 10) + "px").style("top", (event.pageY - 10) + "px")
                .select("#tooltip-value").html(isAdvanced ? `<b>Utakmica:</b> ${d.Label}<br><b>Prekršaji:</b> ${d.Param4_1}<br><b>Kartoni:</b> ${d.Param4_2}` : `<b>Utakmica:</b> ${d.Label}<br><b>Golova na meču:</b> ${d.Param4_1}<br><b>Gledatelja:</b> ${d.Param4_2.toLocaleString()}`); 
            d3.select("#tooltip").classed("hidden", false); 
        })
        .on("mouseout", () => d3.select("#tooltip").classed("hidden", true));
}