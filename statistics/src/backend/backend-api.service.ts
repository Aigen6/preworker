import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface BackendDepositStats {
  date: string; // YYYY-MM-DD
  deposit_count: number;
  total_gross_amount: string;
  total_allocatable_amount: string;
  total_fee: string;
}

export interface BackendWithdrawStats {
  date: string; // YYYY-MM-DD
  withdraw_count: number;
  total_amount: string;
}

export interface BackendStatsResponse {
  success: boolean;
  data: BackendDepositStats[] | BackendWithdrawStats[];
  summary?: {
    total_days?: number;
    total_deposits?: number;
    total_withdraws?: number;
    total_gross_amount?: string;
    total_allocatable_amount?: string;
    total_fee?: string;
    total_amount?: string;
  };
}

@Injectable()
export class BackendApiService {
  private readonly logger = new Logger(BackendApiService.name);
  private readonly axiosInstance: AxiosInstance;

  constructor(private configService: ConfigService) {
    const apiUrl = this.configService.get<string>('backend.apiUrl');
    const apiToken = this.configService.get<string>('backend.apiToken');

    this.axiosInstance = axios.create({
      baseURL: apiUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        ...(apiToken && { Authorization: `Bearer ${apiToken}` }),
      },
    });
  }

  /**
   * Get daily checkbook statistics from backend
   * This aggregates all addresses' deposits
   * 
   * Note: This endpoint is OPTIONAL. If Backend doesn't provide this endpoint,
   * the method will return an empty array and hourly statistics aggregation
   * will continue without Backend statistics.
   */
  async getDailyCheckbookStats(
    startDate?: string,
    endDate?: string,
  ): Promise<BackendDepositStats[]> {
    try {
      const params: Record<string, string> = {};
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;

      // Note: This endpoint is optional. If it doesn't exist, we return empty array.
      // The Statistics Service will continue to work, but hourly aggregation won't include Backend stats.
      const response = await this.axiosInstance.get<BackendStatsResponse>(
        '/api/statistics/checkbooks/daily',
        { params },
      );

      if (response.data.success && Array.isArray(response.data.data)) {
        return response.data.data as BackendDepositStats[];
      }

      this.logger.warn('Unexpected response format from checkbooks/daily');
      return [];
    } catch (error) {
      this.logger.error(
        `Error fetching checkbook statistics: ${error.message}`,
        error.stack,
      );
      // Return empty array on error to not break the aggregation
      return [];
    }
  }

  /**
   * Get daily withdraw statistics from backend
   * This aggregates all addresses' withdrawals
   * 
   * Note: This endpoint is OPTIONAL. If Backend doesn't provide this endpoint,
   * the method will return an empty array and hourly statistics aggregation
   * will continue without Backend statistics.
   */
  async getDailyWithdrawStats(
    startDate?: string,
    endDate?: string,
  ): Promise<BackendWithdrawStats[]> {
    try {
      const params: Record<string, string> = {};
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;

      // Note: This endpoint is optional. If it doesn't exist, we return empty array.
      // The Statistics Service will continue to work, but hourly aggregation won't include Backend stats.
      const response = await this.axiosInstance.get<BackendStatsResponse>(
        '/api/statistics/withdraws/daily',
        { params },
      );

      if (response.data.success && Array.isArray(response.data.data)) {
        return response.data.data as BackendWithdrawStats[];
      }

      this.logger.warn('Unexpected response format from withdraws/daily');
      return [];
    } catch (error) {
      this.logger.error(
        `Error fetching withdraw statistics: ${error.message}`,
        error.stack,
      );
      return [];
    }
  }

  /**
   * Get statistics for a specific date (today)
   */
  async getTodayStats(): Promise<{
    deposits: BackendDepositStats[];
    withdraws: BackendWithdrawStats[];
  }> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    const [deposits, withdraws] = await Promise.all([
      this.getDailyCheckbookStats(today, today),
      this.getDailyWithdrawStats(today, today),
    ]);

    return { deposits, withdraws };
  }

  /**
   * Get detailed checkbook list from backend
   * Returns list of checkbooks with full details for matching analysis
   */
  async getCheckbookList(
    startDate?: string,
    endDate?: string,
    chainId?: number,
  ): Promise<any[]> {
    try {
      const params: Record<string, string> = {};
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      if (chainId) params.chain_id = chainId.toString();

      // Try to get detailed checkbook list
      // Note: This endpoint may need to be implemented in backend
      const response = await this.axiosInstance.get<any>(
        '/api/checkbooks',
        { params },
      );

      if (response.data.success && Array.isArray(response.data.data)) {
        return response.data.data;
      }

      // Fallback: if endpoint doesn't exist, return empty array
      this.logger.warn('Checkbook list endpoint may not be available');
      return [];
    } catch (error) {
      this.logger.error(
        `Error fetching checkbook list: ${error.message}`,
        error.stack,
      );
      return [];
    }
  }

  /**
   * Get detailed withdraw list from backend
   * Returns list of withdraws with full details for matching analysis
   */
  async getWithdrawList(
    startDate?: string,
    endDate?: string,
    chainId?: number,
  ): Promise<any[]> {
    try {
      const params: Record<string, string> = {};
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      if (chainId) params.chain_id = chainId.toString();

      // Try to get detailed withdraw list
      // Note: This endpoint may need to be implemented in backend
      const response = await this.axiosInstance.get<any>(
        '/api/withdraws',
        { params },
      );

      if (response.data.success && Array.isArray(response.data.data)) {
        return response.data.data;
      }

      // Fallback: if endpoint doesn't exist, return empty array
      this.logger.warn('Withdraw list endpoint may not be available');
      return [];
    } catch (error) {
      this.logger.error(
        `Error fetching withdraw list: ${error.message}`,
        error.stack,
      );
      return [];
    }
  }
}
