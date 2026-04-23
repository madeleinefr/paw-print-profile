/**
 * SearchService - Business logic for lost pet search functionality
 * 
 * Provides public search capabilities for finding lost pets using
 * species, breed, age range, tags, and location filters.
 * Requirements: [FR-11], [FR-12], [FR-12]
 */

import { PetRepository } from '../repositories/pet-repository'
import { ClinicRepository } from '../repositories/clinic-repository'
import { ImageRepository } from '../repositories/image-repository'
import {
  Pet,
  Clinic,
  SearchCriteria,
  CompletePetRecord,
} from '../models/entities'
import {
  validateSearchCriteria,
  throwIfInvalid,
} from '../validation/validators'

export interface SearchResult {
  petId: string
  name: string
  species: string
  breed: string
  age: number
  images: {
    url: string
    tags: string[]
  }[]
  owner?: {
    name: string
    phone: string
    email: string
  }
  clinic: {
    name: string
    phone: string
    address: string
    city: string
    state: string
  }
  isMissing: boolean
  contactMethod?: 'platform_messaging' | 'owner_contact'
  messageUrl?: string
}

export class SearchService {
  private petRepo: PetRepository
  private clinicRepo: ClinicRepository
  private imageRepo: ImageRepository

  constructor(tableName?: string) {
    this.petRepo = new PetRepository(tableName)
    this.clinicRepo = new ClinicRepository(tableName)
    this.imageRepo = new ImageRepository(tableName)
  }

  /**
   * Search for pets using various criteria
   * Returns results with images, owner contact, and clinic details
   */
  async search(criteria: SearchCriteria): Promise<SearchResult[]> {
    // Validate search criteria
    const validationErrors = validateSearchCriteria(criteria)
    throwIfInvalid(validationErrors)

    // Perform the search
    const pets = await this.petRepo.search(criteria)

    // Convert to search results with complete information
    const results: SearchResult[] = []

    for (const pet of pets) {
      // Get clinic information
      const clinic = await this.clinicRepo.findById(pet.clinicId)
      if (!clinic) {
        continue // Skip pets with invalid clinic references
      }

      // Get images for this pet
      const petImages = await this.imageRepo.findByPet(pet.petId)
      const images = petImages.map(img => ({ url: img.url, tags: img.tags }))

      const searchResult: SearchResult = {
        petId: pet.petId,
        name: pet.name,
        species: pet.species,
        breed: pet.breed,
        age: pet.age,
        images,
        owner: pet.ownerName && pet.ownerPhone && pet.ownerEmail ? {
          name: pet.ownerName,
          phone: pet.ownerPhone,
          email: pet.ownerEmail,
        } : undefined,
        clinic: {
          name: clinic.name,
          phone: clinic.phone,
          address: clinic.address,
          city: clinic.city,
          state: clinic.state,
        },
        isMissing: pet.isMissing,
      }

      results.push(searchResult)
    }

    return results
  }

  /**
   * Search specifically for missing pets
   */
  async searchMissingPets(criteria: SearchCriteria): Promise<SearchResult[]> {
    const allResults = await this.search(criteria)
    return allResults.filter(result => result.isMissing)
  }

  /**
   * Public search: only missing pets, owner contact masked by default [FR-11][FR-15]
   *
   * - Filters results to isMissing === true
   * - Strips owner phone/email unless the pet record explicitly allows sharing
   * - Adds contactMethod and messageUrl for anonymous platform messaging
   */
  async searchPublic(criteria: SearchCriteria): Promise<SearchResult[]> {
    const missingResults = await this.searchMissingPets(criteria)

    return missingResults.map(result => ({
      ...result,
      // Strip owner contact info — public users use platform messaging
      owner: undefined,
      contactMethod: 'platform_messaging' as const,
      messageUrl: `https://app.pawprintprofile.com/contact/${result.petId}`,
    }))
  }

  /**
   * Get pet details for search result (public endpoint)
   */
  async getPetDetails(petId: string): Promise<SearchResult | null> {
    const pet = await this.petRepo.findById(petId)
    if (!pet) {
      return null
    }

    const clinic = await this.clinicRepo.findById(pet.clinicId)
    if (!clinic) {
      return null
    }

    // Get images for this pet
    const petImages = await this.imageRepo.findByPet(pet.petId)
    const images = petImages.map(img => ({ url: img.url, tags: img.tags }))

    return {
      petId: pet.petId,
      name: pet.name,
      species: pet.species,
      breed: pet.breed,
      age: pet.age,
      images,
      owner: pet.ownerName && pet.ownerPhone && pet.ownerEmail ? {
        name: pet.ownerName,
        phone: pet.ownerPhone,
        email: pet.ownerEmail,
      } : undefined,
      clinic: {
        name: clinic.name,
        phone: clinic.phone,
        address: clinic.address,
        city: clinic.city,
        state: clinic.state,
      },
      isMissing: pet.isMissing,
    }
  }

  /**
   * Search pets by location (within radius of given coordinates)
   */
  async searchByLocation(
    latitude: number,
    longitude: number,
    radiusKm: number,
    additionalCriteria?: Omit<SearchCriteria, 'location'>
  ): Promise<SearchResult[]> {
    // Find nearby clinics
    const nearbyClinics = await this.clinicRepo.findNearby(latitude, longitude, radiusKm)
    
    if (nearbyClinics.length === 0) {
      return []
    }

    // Get all pets from nearby clinics
    const allResults: SearchResult[] = []

    for (const clinic of nearbyClinics) {
      // Get pets for this clinic
      let page = 1
      let hasMore = true

      while (hasMore) {
        const petsPage = await this.petRepo.findByClinic(clinic.clinicId, { page, limit: 100 })
        
        for (const pet of petsPage.items) {
          // Apply additional criteria if specified
          if (additionalCriteria) {
            if (additionalCriteria.species && pet.species !== additionalCriteria.species) {
              continue
            }
            if (additionalCriteria.breed && !pet.breed.toLowerCase().includes(additionalCriteria.breed.toLowerCase())) {
              continue
            }
            if (additionalCriteria.ageMin !== undefined && pet.age < additionalCriteria.ageMin) {
              continue
            }
            if (additionalCriteria.ageMax !== undefined && pet.age > additionalCriteria.ageMax) {
              continue
            }
          }

          // Get images for this pet
          const petImages = await this.imageRepo.findByPet(pet.petId)
          const images = petImages.map(img => ({ url: img.url, tags: img.tags }))

          const searchResult: SearchResult = {
            petId: pet.petId,
            name: pet.name,
            species: pet.species,
            breed: pet.breed,
            age: pet.age,
            images,
            owner: pet.ownerName && pet.ownerPhone && pet.ownerEmail ? {
              name: pet.ownerName,
              phone: pet.ownerPhone,
              email: pet.ownerEmail,
            } : undefined,
            clinic: {
              name: clinic.name,
              phone: clinic.phone,
              address: clinic.address,
              city: clinic.city,
              state: clinic.state,
            },
            isMissing: pet.isMissing,
          }

          allResults.push(searchResult)
        }

        hasMore = petsPage.pagination.hasNext
        page++
      }
    }

    return allResults
  }

  /**
   * Get search suggestions based on partial input
   */
  async getSearchSuggestions(partialQuery: string): Promise<{
    species: string[]
    breeds: string[]
  }> {
    // This is a simplified implementation
    
    const query = partialQuery.toLowerCase().trim()
    if (query.length < 2) {
      return { species: [], breeds: [] }
    }

    // Get a sample of pets to extract species and breeds
    const samplePets = await this.petRepo.search({}) // Get all pets (limited by repository implementation)
    
    const speciesSet = new Set<string>()
    const breedsSet = new Set<string>()

    samplePets.forEach(pet => {
      if (pet.species.toLowerCase().includes(query)) {
        speciesSet.add(pet.species)
      }
      if (pet.breed.toLowerCase().includes(query)) {
        breedsSet.add(pet.breed)
      }
    })

    return {
      species: Array.from(speciesSet).slice(0, 10), // Limit to 10 suggestions
      breeds: Array.from(breedsSet).slice(0, 10),
    }
  }

  /**
   * Get popular search terms (for search analytics)
   */
  async getPopularSearchTerms(): Promise<{
    species: { name: string; count: number }[]
    breeds: { name: string; count: number }[]
  }> {
    // This is a simplified implementation
    // In production, you'd track actual search queries and their frequency
    
    const allPets = await this.petRepo.search({})
    
    const speciesCount: Record<string, number> = {}
    const breedCount: Record<string, number> = {}

    allPets.forEach(pet => {
      speciesCount[pet.species] = (speciesCount[pet.species] || 0) + 1
      breedCount[pet.breed] = (breedCount[pet.breed] || 0) + 1
    })

    const popularSpecies = Object.entries(speciesCount)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    const popularBreeds = Object.entries(breedCount)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    return {
      species: popularSpecies,
      breeds: popularBreeds,
    }
  }
}