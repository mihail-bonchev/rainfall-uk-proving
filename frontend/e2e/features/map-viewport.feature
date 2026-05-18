Feature: Map viewport and initial state
  As a user of Rainfall Explorer
  I want the map to open centred on the UK at a sensible zoom level
  So that I can immediately see all UK rainfall stations

  Scenario: Map initialises without an error state
    Given I open the Rainfall Explorer application
    When the map has finished initialising
    Then the map should not show an error indicator

  Scenario: Map is interactive after load
    Given I open the Rainfall Explorer application
    When the map has finished initialising
    Then the map controls should be present
