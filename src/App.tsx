import React, {useEffect, useState} from 'react';
import {Container, Nav, Navbar, Spinner} from "react-bootstrap";
import 'react-bootstrap-table-next/dist/react-bootstrap-table2.css';
import 'react-bootstrap-typeahead/css/Typeahead.css';
import {HashRouter, Link, Route, Switch} from "react-router-dom";
import './App.css';
import './dark-mode.css';
import UMDatabaseWrapper from './data/UMDatabaseWrapper';
import CarrotJuicerPage from "./pages/CarrotJuicerPage";
import RaceDataPage from "./pages/RaceDataPage";
import MultiRaceParserPage from "./pages/MultiRaceParserPage";


export default function App() {
    const [umdbLoaded, setUmdbLoaded] = useState(false);

    useEffect(() => {
        UMDatabaseWrapper.initialize().then(() => setUmdbLoaded(true));
    }, []);

    if (!umdbLoaded) {
        return <div><Spinner animation="border"/> Loading UMDatabase...</div>;
    }

    return <HashRouter>
        <Navbar bg="dark" variant="dark" expand="lg">
            <Container>
                <Navbar.Brand as={Link} to="/">Hakuraku</Navbar.Brand>
                <Navbar.Toggle aria-controls="basic-navbar-nav"/>

                <Navbar.Collapse id="basic-navbar-nav">
                    <Nav className="mr-auto">
                        <Nav.Link as={Link} to="/racedata">Race Parser</Nav.Link>
                        <Nav.Link as={Link} to="/multirace">Multi-race parser</Nav.Link>
                        <Nav.Link as={Link} to="/carrotjuicer">Packet Inspector</Nav.Link>
                    </Nav>
                </Navbar.Collapse>
            </Container>
        </Navbar>

        <Container>
            <Switch>
                <Route path="/carrotjuicer" component={CarrotJuicerPage as any} />
                <Route path="/racedata" component={RaceDataPage as any} />
                <Route path="/multirace" component={MultiRaceParserPage as any} />
                <Route path="/" component={RaceDataPage as any} />
            </Switch>
        </Container>
    </HashRouter>;
}

