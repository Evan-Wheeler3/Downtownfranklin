# Downtown Franklin, TN: Geographic, Data and Licensing Research

Accessed: 2026-09-30. Scope: historic downtown Franklin, Williamson County, Tennessee.

## 0. Method and limits (read first)

- **WebFetch was blocked by the egress proxy for every domain tried** (franklintn.gov, wikipedia.org, franklintheatre.com, hmdb.org, docs.overturemaps.org). All findings below come from **WebSearch result excerpts**: page titles, URLs and summarized snippets. I did not read full page bodies.
- Classification labels:
  - **VERIFIED\***: stated in a search excerpt from an authoritative or primary source (official agency, the venue itself, the license holder). The asterisk means I saw the excerpt but not the full page. Re-check before shipping anything that depends on it.
  - **INFERRED**: reasoned from one or more sources.
  - **REFERENCE ONLY**: fine to look at, but not data we may copy or redistribute.
  - **UNKNOWN**: not found.
- Nothing here is invented. Where sources disagree, both versions are given.

---

## 1. Geographic bounds of historic downtown

### 1.1 Franklin Historic District (National Register)
- Listed on the NRHP on **5 Oct 1972**. Boundary increases on **13 Apr 1988** and **15 Mar 2000**. About **148 acres (60 ha)**. Centered on **Main St (TN 96) and 3rd Ave (US 31)**. The increases added 3rd Ave S between S. Margin St and the railroad, and the 300 block of 4th Ave S. Source: Wikipedia (secondary, based on NRHP records). **VERIFIED\*** (secondary)
- The district is described as a 16-block area of the original downtown. It is "outlined by Margin streets on the north and south" and includes 1st–5th Avenues (running north–south) and Church, Main and Bridge Streets (running east–west). **VERIFIED\*** (secondary)
- Reference point from Wikipedia: **35.92500 N, -86.86917 W**. **VERIFIED\*** (secondary)

### 1.2 Downtown Franklin Association (DFA) / Main Street area
- The American Planning Association's "Great Places" listing (2009) says: *"Franklin's historic downtown is bounded by North Margin Street and Bridge Street to the north, South Margin Street to the south, 1st Avenue to the east and 5th Avenue to the west."* It also says the 16-block neighborhood is on the NRHP. **VERIFIED\***
- DFA is a subsidiary of the Heritage Foundation of Williamson County and an accredited Main Street America program. Membership is open to businesses and building owners "located in the 16-block historic district." **VERIFIED\***
- The two major thoroughfares, **Main St (E/W)** and **3rd Ave (N/S)**, radiate from the Public Square (APA). **VERIFIED\***

### 1.3 City zoning layers
- The Franklin Zoning Ordinance uses four layers: base district, overlay district, character-area overlay, and development standards. The overlays include the **Central Franklin Overlay (CFO)** and a **Historic Preservation overlay**. **VERIFIED\*** (UIC zoning profile summarizing the ordinance)
- The exact CFO or "Central Business District" polygon was **UNKNOWN**. It should be taken from the City GIS zoning and historic layers (section 2).

### 1.4 Bounding box
Anchor coordinates (all from search excerpts):

| Point | Lat | Lon | Source |
|---|---|---|---|
| Williamson County Courthouse (square, 3rd Ave/Main) | 35.92389 | -86.86917 | Wikipedia infobox |
| Franklin Theatre, 419 Main | 35.92412 | -86.87084 | Bandsintown / Cinema Treasures excerpt |
| St. Paul's Episcopal, 510 W Main | 35.92361 | -86.87250 | Wikipedia infobox |
| Hincheyville HD centroid (west of 5th Ave) | ~35.9225 | ~-86.8761 | Wikipedia (35°55′21″N 86°52′34″W) |
| Fort Granger (across the river, NE) | 35.92583 | -86.86056 | Wikipedia |

- **Core (the 16 historic blocks): lat 35.9205 to 35.9275, lon -86.8740 to -86.8645.** **INFERRED.**
  - Reasoning: the 300s are around 3rd Ave (-86.8692), the 400s are at -86.8708 and the 500s are at -86.8725. That is roughly 0.0016° of longitude per block, so 1st Ave sits near -86.866 and 5th Ave near -86.872, plus some margin.
  - North–south: the Margin streets are about 2 blocks either side of Main, centered on 35.9239.
- **Recommended playable box, including the Harpeth River edge, Bicentennial Park, the Harpeth Hotel riverfront and the pedestrian bridge to Pinkerton Park: lat 35.9190 to 35.9290, lon -86.8770 to -86.8580.** **INFERRED.**
- **Must-do before building geometry:** replace these numbers with the true extent of the City GIS historic-district and zoning polygons (section 2). They are a starting estimate, not surveyed data.

---

## 2. GIS and open data sources

### 2.1 City of Franklin
- **ArcGIS REST directory: `https://publicmaps.franklintn.gov/arcgis/rest/services`** (ArcGIS Server 11.5). **VERIFIED\***
  - Root services: AddressNotice, CityTaxGrid, COF_Mask, **Contours12**, **Contours18**, CountyTaxGrid, **Ortho23WMS (ImageServer)**, **ParkingLots**, Schools, **Sidewalks**, **StreetLabels**.
  - Folders: COFRoutes, FieldCollection, Imagery, Locators, Maps, Utilities.
  - `Maps/` includes COFBase, **COFRecreation**, **DowntownParking**, GovernmentServices, PublicSafety, PublicConservationSE, TrafficCameras, BuildingPermits, CIP and zoning/planning services.
  - Example: `https://publicmaps.franklintn.gov/arcgis/rest/services/Maps/COFRecreation/MapServer`
- **GIS portal: `https://maps.franklintn.gov/portal/`** (requires sign-in for editing). **VERIFIED\***
- **Data policy:** the City GIS page says the City "provides GIS data for a nominal fee to the public," ordered by tax grid. Layers offered include Aerial Photography, **Address Points, Building Footprints**, **Historic Property/National Register**, **Parcels, Parks, Streets**, Subdivisions and **Zoning**.
  - Page: `https://www.franklintn.gov/government/departments-a-j/information-technology/geographical-information-systems-gis`. **VERIFIED\***
- **License or terms for the REST services: UNKNOWN.** I found no open license (such as CC0 or CC-BY). Because the City *sells* the data, treat the REST layers as **REFERENCE ONLY**: use them for alignment and QA, not for bulk extraction into the game. Ask the City GIS office for written permission or a license first.
- I found no ArcGIS Hub-style open data portal for the City of Franklin, TN. (Search results for "Franklin" portals returned Franklin County, VA and others.) **UNKNOWN / likely none.**

### 2.2 Williamson County
- Property Assessor and interactive maps: `https://www.williamsoncounty-tn.gov/64/Property-Assessor` and `http://www.williamsoncounty-tn.gov/1381/Maps`. **VERIFIED\***
- Williamson County is **not** part of the TN Comptroller's statewide parcel program; you have to contact the county directly (`https://comptroller.tn.gov/office-functions/pa/gisredistricting/redistricting-and-land-use-maps/parcel-data.html`). **VERIFIED\***
- Download terms: **UNKNOWN.** Treat as **REFERENCE ONLY** until confirmed.

### 2.3 State of Tennessee
- **TNMap** (STS-GIS): `https://tnmap.tn.gov/`. Open data: `https://tn-tnmap.opendata.arcgis.com/`. Statewide orthoimagery, lidar/elevation, NG911 address points and road centerlines, and parcels. An aggregator (atlas.co) describes the license as "Open (free use)." **INFERRED** (aggregator claim). Check the terms on each dataset page.
- Imagery service: `https://geodata.tn.gov/datasets/tnmap-imagery-webmercator`. Terms **UNKNOWN**.
- **TN Elevation/LiDAR Program:** `https://lidar.tn.gov/` (FAQ, coverage map, data downloads).
  - Collected with USGS 3DEP. Statewide QL2 coverage was finished in spring 2021 (USGS/Woolpert).
  - Lidar is shared as `.zlas` (Esri compressed); the same collections are also available as LAZ/DEMs through USGS.
  - **VERIFIED\***

### 2.4 USGS 3DEP (elevation)
- Tennessee QL2 lidar is 100% complete, with 1 m DEMs available (UTK LibGuide and USGS). Downloads: **USGS LidarExplorer** `https://apps.nationalmap.gov/lidar-explorer/`, the 1 m DEM collection `https://data.usgs.gov/datacatalog/data/USGS:77ae0551-c61e-4979-aedd-d797abdcde0e`, the Seamless 1 m (S1M) product, and OpenTopography. **VERIFIED\***
- USGS-produced data is generally **public domain**; a credit line is requested. **VERIFIED\*** (USGS FAQ excerpt on topo maps; the same policy applies to 3DEP)
- **For the game:** the 1 m DEM plus a classified-lidar building/ground split is the best terrain source, because it captures the Harpeth floodplain and the slope from downtown toward the river.

---

## 3. Licensing summary

| Dataset | License | Obligations for a browser game | Class |
|---|---|---|---|
| OpenStreetMap | ODbL 1.0 | A game rendered from OSM is a **Produced Work**. Visible attribution is required: "© OpenStreetMap contributors," noting ODbL. Share-alike applies only if you publicly release a **derivative database** (for example, shipping extracted OSM-derived geometry as downloadable data). Assets baked into a game are generally a Produced Work, but see the OSMF Licence FAQ. | VERIFIED\* |
| Overture: Buildings | ODbL | Same as OSM. Sources: OSM, Esri Community Maps, Microsoft, Google Open Buildings. Some heights come from USGS 3DEP. | VERIFIED\* |
| Overture: Transportation | ODbL | Same as OSM | VERIFIED\* |
| Overture: Base | ODbL | Same as OSM | VERIFIED\* |
| Overture: Divisions | ODbL | Same as OSM | VERIFIED\* |
| Overture: Places | CDLA-Permissive-2.0 (and Apache 2.0 per one source) | Include the license text. No share-alike. Contains no OSM data. | VERIFIED\* |
| Overture: Addresses | Varies by source. US data historically from USDOT **National Address Database**. | Keep per-source attribution. Only "unrestricted" sources are included. | VERIFIED\* |
| Microsoft GlobalMLBuildingFootprints | ODbL | Attribution. Share-alike on derived databases. | VERIFIED\* |
| USGS 3DEP / National Map | Public domain | Credit requested | VERIFIED\* |
| NAIP orthoimagery (USDA FPAC) | Public domain (currently) | Credit USDA. USDA has *considered* a licensing model, so recheck. | VERIFIED\* |
| Google Maps / Street View | Proprietary ToS | **REFERENCE ONLY.** The ToS forbids exporting or scraping content, bulk downloading Street View images, and building 3D models from Google imagery. Use it only as a human visual reference; never trace or bake it in. | VERIFIED\* |
| City of Franklin GIS | Sold for a fee; license UNKNOWN | **REFERENCE ONLY** until written permission | INFERRED |

Practical recommendation (**INFERRED**):
- Build geometry from **OSM + Overture (ODbL) + USGS DEM (PD)**, with City GIS used only for visual QA.
- Show an in-game credits or attribution overlay that is visible without the player having to interact (per the OSMF attribution guidelines).
- If you ship the processed map data as a separate download, it must be ODbL.
- Commercial use is allowed under ODbL, CDLA-P and PD.

---

## 4. Hero location candidates

Source-date notes: Yelp and aggregator "Updated <month> 2026" labels are shown as the source date. They suggest the business is still operating but are secondary evidence.

| # | Name | Address | Category | Why notable | Source date | Confidence |
|---|---|---|---|---|---|---|
| 1 | **The Franklin Theatre** | 419 Main St | Theatre / music venue / cinema | Opened summer 1937; closed 2007; bought by the Heritage Foundation in 2008; reopened **3 Jun 2011** after an ~$8.5M rehabilitation. About 300 seats, Art Deco. Hosts concerts, theatre, songwriter nights and classic plus first-run films. The 2026 calendar lists BoDeans (Sep 19), Ruby Amanfu (Sep 27) and The Machine (Sep 29), and there is a classic film series. | 2026 (Bandsintown listing) | VERIFIED\* |
| 2 | **Williamson County Courthouse** | Public Square / 3rd Ave S. One source lists "305 Public Square"; Waze lists "135 4th Ave S". The addresses **conflict**. | Civic / historic | Built 1858, Greek Revival, 65×90 ft, four cast-iron Doric columns, damaged by an 1871 tornado. Contributing to the NRHP district. | n/a | VERIFIED\* (address UNKNOWN) |
| 3 | **Public Square: Confederate Monument ("Chip") and "March to Freedom"** | Center of the square, Main St and 3rd Ave | Monument / civic space | See the neutral summary below. | 2020–2022 sources | VERIFIED\* |
| 4 | **St. Paul's Episcopal Church** | 510 W Main St | Historic church (active) | Organized 1827; completed 1831–1834 (sources differ). Tennessee's oldest Episcopal congregation. Gothic Revival. Used by Union troops and as a hospital after the Battle of Franklin (30 Nov 1864). NRHP 1972. | Yelp, Jul 2026 | VERIFIED\* |
| 5 | **Masonic Hall (Hiram Lodge No. 7)** | 115 2nd Ave S | Historic landmark | Built 1823; the oldest public building in Franklin. Early Gothic Revival. Site of the 1830 Treaty of Franklin negotiations with the Chickasaw Nation. National Historic Landmark, 1973. | n/a | VERIFIED\* |
| 6 | **Franklin Presbyterian manse / Frothy Monkey** | 125 5th Ave S | Café | Located in the former manse of Historic Franklin Presbyterian Church. | Yelp, Sep 2026 | VERIFIED\* |
| 7 | **Gray's on Main** | 332 Main St | Restaurant / bar / live music | Occupies the ca. 1876 Gray Drug Co. building; opened 2013. Dining on the first floor, a bar and music stage on the second, and a members' club on the third. Free nightly music. | Yelp, Sep 2026 | VERIFIED\* |
| 8 | **Puckett's (Grocery & Restaurant)** | 120 4th Ave S | Restaurant / live music | Southern and BBQ food with live music. More than 20 years downtown. Across from the 4th Ave garage. | Snippet cites 2025 award | VERIFIED\* |
| 9 | **Kilwins Franklin** | 405 Main St | Sweets shop | Near 4th and Main; more than 10 years on Main St. | 2026 listing | VERIFIED\* |
| 10 | **Landmark Booksellers** | 114 E Main St | Bookstore | Housed in an 1820s Greek Revival building; about 60,000 volumes. | Yelp, Aug 2026 | VERIFIED\* |
| 11 | **The Legendary Kimbro's Pickin' Parlor** | 214 S Margin St | Music venue / restaurant | Opened 2005 by Ron Kimbro in a Victorian cottage. Live music Monday–Saturday. | 2026 listings | VERIFIED\* |
| 12 | **The Harpeth Hotel (Curio by Hilton)** | 130 2nd Ave N | Boutique hotel | Opened Dec 2019. 119 rooms. On the Harpeth riverbank. | 2019 press | VERIFIED\* |
| 13 | **Five Points / Five Points Post Office** | 510 Columbia Ave | Intersection / landmark | Five-way junction of Main St, 5th Ave S and Columbia Ave at the west edge of downtown. The Margin District development is one block south. | Yelp, Jun 2026 | VERIFIED\* |
| 14 | **Bicentennial Park** | 3rd Ave N / N Margin / Harpeth River. One source gives "400 5th Ave N", which looks **inconsistent**; verify. | Park / event space | 14 acres on the former Georgia Boot factory site. Pavilion, stage, river overlook, greenway, flood-resilient design. Reopened **18 Jun 2025**. | 2025 | VERIFIED\* |
| 15 | **Parking: 2nd Ave S Garage** | 108 2nd Ave S (at Main) | Parking garage | Free, 24 h, about 303 spaces, EV and motorcycle spaces. | n/a | VERIFIED\* |
| 16 | **Parking: 4th Ave S Garage** | 115 4th Ave S | Parking garage | Free, 24 h, about 333 spaces, four levels. | n/a | VERIFIED\* |
| 17 | **Pinkerton Park** | 405 Murfreesboro Rd | Park (just outside downtown, east of the river) | 34 acres, 1-mile loop trail. The **Sue Douglas Berry Memorial pedestrian bridge** links it to downtown. Trail to Fort Granger. | n/a | VERIFIED\* |
| 18 | **Fort Granger** | 113 Fort Granger Dr | Civil War earthwork (outside, NE across the river) | Union fort, 1862. | n/a | VERIFIED\* |
| 19 | **Carter House** | 1140 Columbia Ave | Battlefield house museum (**outside downtown**, about 1 mi south) | Epicenter of the 30 Nov 1864 battle; thousands of bullet holes. Run by the Battle of Franklin Trust. | Yelp, Jul 2026 | VERIFIED\* |
| 20 | **Lotz House** | 1111 Columbia Ave | House museum (**outside downtown**) | Built 1858 by J.A. Lotz, directly across from the Carter House. | n/a | VERIFIED\* |
| 21 | **Carnton** | 1345 Carnton Ln | Plantation / battlefield hospital (**outside downtown**, SE) | Run by the Battle of Franklin Trust. | n/a | VERIFIED\* |
| 22 | Hincheyville Historic District | W Main, Fair, 6th–10th Aves | Residential historic district (just west of 5th Ave) | Franklin's first residential addition (1819). NRHP 1982; boundary increase 2020. | n/a | VERIFIED\* |

**Public Square, neutral summary:**
- The Confederate monument ("Chip") was erected in **1899** on the courthouse grounds. The United Daughters of the Confederacy (UDC) own it.
- A 2020 settlement between the City and the UDC gave the UDC a deed to the monument and the ground beneath it. The square stays under City ownership and otherwise keeps its status quo.
- Through the **Fuller Story** initiative, four historical markers were added. They cover the market house where enslaved people were sold, the 1867 riot, the Civil War, and Reconstruction.
- On **23 Oct 2021**, the bronze **"March to Freedom"** statue of a U.S. Colored Troops soldier (sculptor Joe F. Howard) was dedicated in front of the courthouse, across from the Confederate monument.
- **I found no 2025–2026 reporting of a change** (no removal or relocation). Current status is **INFERRED unchanged**; check local news before release.
- Sources: franklintn.gov/our-city/the-fuller-story, WPLN, CNN (2021-10-25), Williamson Herald, Visit Franklin.

**Annual events** (all on Main St downtown and produced by the Heritage Foundation unless noted):

| Event | 2026 dates | Notes | Confidence |
|---|---|---|---|
| Main Street Festival | Apr 25–26, 2026 | | VERIFIED\* |
| PumpkinFest | Oct 24–25, 2026 | First two-day edition in the festival's 41-year history | VERIFIED\* |
| Dickens of a Christmas | Dec 12–13, 2026 | | VERIFIED\* |
| Franklin Rodeo | May 14–16, 2026 | 75th anniversary. Held at the **Williamson County Ag Expo Park, listed as "4215 Long Ave.", not downtown**. | VERIFIED\* |

---

## 5. Downtown street grid and directionality

- **North–south avenues:** 1st, 2nd, 3rd (US 31), 4th and 5th Avenues, each split North and South at Main St.
  - 4th Ave carries the honorary name **"Cornelia Clark Way"** (Williamson Herald).
  - **VERIFIED\***
- **East–west streets:** North Margin St, Bridge St, Church St, Main St (TN 96; East and West split at the square), South Margin St.
  - Columbia Ave runs SW from Five Points.
  - Murfreesboro Rd runs E across the river toward Pinkerton Park.
  - Fair St is in Hincheyville.
  - **VERIFIED\*** / INFERRED for order.
- The exact north-to-south order of Bridge and Church relative to Main is **UNKNOWN** from sources seen. Derive it from OSM.
- **One-way status: UNKNOWN.** No source I could see documents one-way designations for the downtown avenues or Main St.
  - Traffic circulates around the Public Square, which "calms traffic" (APA), but the details weren't stated.
  - **Action:** read `oneway=*` tags from OSM for the bounding box, and cross-check with City street data. Do not assume.

---

## 6. Elevation, terrain and imagery

- **Terrain:**
  - USGS 3DEP 1 m DEM and QL2 lidar (public domain) are the primary source.
  - TN LiDAR (lidar.tn.gov) is the same data.
  - City `Contours12`/`Contours18` and `Ortho23WMS` are **REFERENCE ONLY**.
- **Imagery:**
  - NAIP (USDA, public domain; about 0.6 m) can be used for texture reference or baking. Recheck the USDA license status.
  - TNMap orthoimagery terms are **UNKNOWN**.
  - **Google Street View, Google Earth, Apple and Bing imagery are REFERENCE ONLY.** Don't copy, trace or scrape them. Artists may *look at* them to model facades by hand.
  - Wikimedia Commons (`Category:Franklin_Historic_District_(Tennessee)`) has photos whose licenses vary per file. Check each image's license before using it as a texture.

---

## 7. Source table (all accessed 2026-09-30 via search excerpts; full pages not fetched)

| URL | Publisher | License of source | Classification |
|---|---|---|---|
| https://en.wikipedia.org/wiki/Franklin_Historic_District_(Franklin,_Tennessee) | Wikipedia | CC BY-SA (text) | VERIFIED\* (secondary) |
| https://www.planning.org/greatplaces/neighborhoods/2009/downtownfranklin.htm | American Planning Assn. | Copyright | VERIFIED\* |
| https://williamsonheritage.org/news/dfa-main-street-america-2022/ | Heritage Foundation | Copyright | VERIFIED\* |
| https://go.uic.edu/zoning-for-walkability-profile-Franklin | UIC | Copyright | VERIFIED\* |
| https://web.franklintn.gov/FlippingBook/FranklinZoningOrdinance2024/ | City of Franklin | Gov doc | VERIFIED\* (title only) |
| https://www.franklintn.gov/government/departments-a-j/information-technology/geographical-information-systems-gis | City of Franklin | Data for fee | VERIFIED\* |
| https://publicmaps.franklintn.gov/arcgis/rest/services | City of Franklin | UNKNOWN | REFERENCE ONLY |
| https://maps.franklintn.gov/portal/ | City of Franklin | UNKNOWN | REFERENCE ONLY |
| https://www.williamsoncounty-tn.gov/64/Property-Assessor | Williamson County | UNKNOWN | REFERENCE ONLY |
| https://comptroller.tn.gov/office-functions/pa/gisredistricting/redistricting-and-land-use-maps/parcel-data.html | TN Comptroller | Gov | VERIFIED\* |
| https://tnmap.tn.gov/ ; https://tn-tnmap.opendata.arcgis.com/ | TN STS-GIS | "Open" per aggregator | INFERRED |
| https://atlas.co/data-portals/tn-map-tennessee/ | atlas.co | n/a | INFERRED |
| https://lidar.tn.gov/ | TN STS-GIS / TNGIC | Public (with 3DEP) | VERIFIED\* |
| https://libguides.utk.edu/tngis/elev | Univ. of Tennessee | n/a | VERIFIED\* |
| https://apps.nationalmap.gov/lidar-explorer/ | USGS | Public domain | VERIFIED\* |
| https://data.usgs.gov/datacatalog/data/USGS:77ae0551-c61e-4979-aedd-d797abdcde0e | USGS | Public domain | VERIFIED\* |
| https://www.usgs.gov/faqs/are-usgs-topographic-maps-copyrighted | USGS | Public domain | VERIFIED\* |
| https://catalog.data.gov/dataset/national-agriculture-imagery-program-naip-imagery | USDA / data.gov | Public domain | VERIFIED\* |
| https://osmfoundation.org/wiki/Licence/Attribution_Guidelines | OSMF | n/a | VERIFIED\* |
| https://www.openstreetmap.org/copyright | OSMF | ODbL | VERIFIED\* |
| https://docs.overturemaps.org/attribution/ | Overture Maps Foundation | per theme | VERIFIED\* |
| https://docs.overturemaps.org/guides/buildings/ | Overture | ODbL | VERIFIED\* |
| https://docs.overturemaps.org/guides/addresses/ | Overture | varies | VERIFIED\* |
| https://github.com/microsoft/GlobalMLBuildingFootprints/blob/main/LICENSE | Microsoft | ODbL | VERIFIED\* |
| https://cloud.google.com/maps-platform/terms | Google | Proprietary | REFERENCE ONLY |
| https://www.bandsintown.com/v/10000104-the-franklin-theatre | Bandsintown | n/a | VERIFIED\* (schedule/coords) |
| https://cinematreasures.org/theaters/10215 | Cinema Treasures | n/a | VERIFIED\* |
| https://williamsonheritage.org/portfolio-posts/the-franklin-theatre-hf-owned/ | Heritage Foundation | n/a | VERIFIED\* |
| https://en.wikipedia.org/wiki/Williamson_County_Courthouse_(Tennessee) | Wikipedia | CC BY-SA | VERIFIED\* (secondary) |
| https://en.wikipedia.org/wiki/Confederate_Monument_(Franklin,_Tennessee) | Wikipedia | CC BY-SA | VERIFIED\* (secondary) |
| https://www.franklintn.gov/our-city/the-fuller-story | City of Franklin | n/a | VERIFIED\* |
| https://www.cnn.com/2021/10/25/us/tennessee-us-colored-troops-statue/index.html | CNN | Copyright | VERIFIED\* |
| https://www.williamsonherald.com/communities/debate-over-franklin-public-square-ownership-could-soon-be-settled/article_87c6c44c-c7a1-11ea-ac02-c3dcaefe92e2.html | Williamson Herald | Copyright | VERIFIED\* |
| https://en.wikipedia.org/wiki/St._Paul's_Episcopal_Church_(Franklin,_Tennessee) | Wikipedia | CC BY-SA | VERIFIED\* |
| https://en.wikipedia.org/wiki/Hiram_Masonic_Lodge_No._7 | Wikipedia | CC BY-SA | VERIFIED\* |
| https://www.yelp.com/biz/grays-on-main-franklin | Yelp (Sep 2026) | Proprietary | VERIFIED\* (operating) |
| https://www.graysonmain.com/ | Gray's on Main | n/a | VERIFIED\* |
| https://downtownfranklintn.com/pucketts-restaurant-celebrates-20-years-in-franklin/ | DFA | n/a | VERIFIED\* |
| https://www.kilwins.com/location/stores-near-me-franklin-tn-37064-0134/ | Kilwins | n/a | VERIFIED\* |
| https://www.yelp.com/biz/landmark-booksellers-franklin | Yelp (Aug 2026) | Proprietary | VERIFIED\* |
| https://www.legendarykimbros.com/ | Kimbro's | n/a | VERIFIED\* |
| https://www.yelp.com/biz/frothy-monkey-franklin | Yelp (Sep 2026) | Proprietary | VERIFIED\* |
| https://stories.hilton.com/releases/historic-downtown-franklin-welcomes-the-harpeth-hotel-curio-collection-by-hilton | Hilton | n/a | VERIFIED\* |
| https://www.franklintn.gov/government/departments-k-z/parks/bicentennial-park | City of Franklin | n/a | VERIFIED\* |
| https://franklinis.com/franklin-celebrates-the-grand-opening-of-bicentennial-park/ | FranklinIs | n/a | VERIFIED\* |
| https://downtownfranklintn.com/downtown-franklin-offers-free-parking/ | DFA | n/a | VERIFIED\* |
| https://visitfranklin.com/family-friendly/pinkerton-park/ | Visit Franklin | n/a | VERIFIED\* |
| https://en.wikipedia.org/wiki/Fort_Granger | Wikipedia | CC BY-SA | VERIFIED\* |
| https://www.battlefields.org/visit/heritage-sites/carter-house | American Battlefield Trust | n/a | VERIFIED\* |
| https://en.wikipedia.org/wiki/Lotz_House | Wikipedia | CC BY-SA | VERIFIED\* |
| https://en.wikipedia.org/wiki/Hincheyville_Historic_District | Wikipedia | CC BY-SA | VERIFIED\* |
| https://williamsonheritage.org/events/pumpkinfest/ | Heritage Foundation | n/a | VERIFIED\* |
| https://franklinis.com/pumpkinfest-expands-to-two-day-event-in-downtown-franklin/ | FranklinIs | n/a | VERIFIED\* |
| https://www.eventeny.com/events/dickens-of-a-christmas-2026-26433/ | Eventeny | n/a | VERIFIED\* |
| https://visitfranklin.com/events/2026-franklin-rodeo/ | Visit Franklin | n/a | VERIFIED\* |
| https://www.williamsonherald.com/news/local_news/franklins-fourth-avenue-renamed-cornelia-clark-way/article_7e1b09f6-f249-11ec-9b9f-0f8b777fedfd.html | Williamson Herald | Copyright | VERIFIED\* |
| https://www.yelp.com/biz/five-points-post-office-franklin | Yelp (Jun 2026) | Proprietary | VERIFIED\* |

## 8. Open items
1. Fetch the full pages once the egress policy allows it, and upgrade VERIFIED\* items to VERIFIED.
2. Get the historic-district and CFO polygons from the City GIS and replace the inferred bounding box.
3. Get City and County GIS license terms in writing.
4. Pull OSM `oneway` tags for the bounding box.
5. Resolve the courthouse address conflict (305 Public Square vs 135 4th Ave S).
6. Resolve the Bicentennial Park address.
7. Recheck Public Square news for 2025–2026 changes.
