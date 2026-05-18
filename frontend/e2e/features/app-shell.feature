Feature: Application shell loads correctly
  As a user opening Rainfall Explorer
  I want the application to load reliably
  So that I can start exploring UK rainfall data

  Scenario: App loads and displays the map container
    Given I open the Rainfall Explorer application
    Then I should see the map container on screen

  Scenario: Map renders with WebGL canvas
    Given I open the Rainfall Explorer application
    When the map has finished initialising
    Then the MapLibre canvas should be visible

  Scenario: Application loads without JavaScript errors
    Given I open the Rainfall Explorer application
    When the map container is visible
    Then there should be no uncaught JavaScript errors
